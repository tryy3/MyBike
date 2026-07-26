import type { MaintenanceTaskView } from "shared";
import type { YogaInitialContext } from "graphql-yoga";
import { auth } from "../lib/auth.js";
import { extractApiKeyFromHeaders, verifyGraphQLApiKey } from "../lib/api-key-auth.js";
import type { WearTotals } from "../lib/component-wear.js";
import type { BikeRow } from "../db/schema.js";
import { HttpError } from "../lib/errors.js";
import { createRequestTiming, type RequestTiming } from "./request-timing.js";

export type GraphQLAuthMethod = "session" | "apiKey";

export interface GraphQLContext {
  userId: string | null;
  authMethod: GraphQLAuthMethod | null;
  permissions: Record<string, string[]> | null;
  /** Dedupes maintenance task enrichment within a single GraphQL request. */
  maintenanceTasksByBikeId?: Map<string, Promise<MaintenanceTaskView[]>>;
  /** Dedupes bike-wide Strava wear aggregate within a single GraphQL request. */
  stravaWearByBikeId?: Map<string, Promise<Map<string, WearTotals>>>;
  /** Dedupes requireBike lookups within a single GraphQL request. */
  bikeById?: Map<string, Promise<BikeRow>>;
  /** Optional per-request resolver timings when GRAPHQL_TIMING=1. */
  timing?: RequestTiming;
}

function withRequestState(
  base: Omit<
    GraphQLContext,
    "timing" | "bikeById" | "stravaWearByBikeId" | "maintenanceTasksByBikeId"
  >,
): GraphQLContext {
  return {
    ...base,
    timing: createRequestTiming(),
  };
}

export async function createContext(initialContext: YogaInitialContext): Promise<GraphQLContext> {
  const request = initialContext.request;
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user?.id) {
    return withRequestState({
      userId: session.user.id,
      authMethod: "session",
      permissions: null,
    });
  }

  const apiKey = extractApiKeyFromHeaders(request.headers);
  if (!apiKey) {
    return withRequestState({ userId: null, authMethod: null, permissions: null });
  }

  const verified = await verifyGraphQLApiKey(apiKey);
  if (!verified) {
    return withRequestState({ userId: null, authMethod: null, permissions: null });
  }

  return withRequestState({
    userId: verified.userId,
    authMethod: "apiKey",
    permissions: verified.permissions,
  });
}

export function requireUserId(context: GraphQLContext): string {
  if (!context.userId) {
    throw new HttpError(401, "Unauthorized");
  }
  return context.userId;
}

export type GraphQLPermission = "read" | "write" | "delete";

export function requireGraphQLPermission(
  context: GraphQLContext,
  permission: GraphQLPermission,
): string {
  const userId = requireUserId(context);
  if (context.authMethod !== "apiKey") {
    return userId;
  }

  const actions = context.permissions?.graphql ?? [];
  if (!actions.includes(permission)) {
    throw new HttpError(403, "API key lacks required permission");
  }

  return userId;
}
