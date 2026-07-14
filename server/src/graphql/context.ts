import type { YogaInitialContext } from "graphql-yoga";
import { auth } from "../lib/auth.js";
import { extractApiKeyFromHeaders, verifyGraphQLApiKey } from "../lib/api-key-auth.js";
import { HttpError } from "../lib/errors.js";

export type GraphQLAuthMethod = "session" | "apiKey";

export interface GraphQLContext {
  userId: string | null;
  authMethod: GraphQLAuthMethod | null;
  permissions: Record<string, string[]> | null;
}

export async function createContext(initialContext: YogaInitialContext): Promise<GraphQLContext> {
  const request = initialContext.request;
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      authMethod: "session",
      permissions: null,
    };
  }

  const apiKey = extractApiKeyFromHeaders(request.headers);
  if (!apiKey) {
    return { userId: null, authMethod: null, permissions: null };
  }

  const verified = await verifyGraphQLApiKey(apiKey);
  if (!verified) {
    return { userId: null, authMethod: null, permissions: null };
  }

  return {
    userId: verified.userId,
    authMethod: "apiKey",
    permissions: verified.permissions,
  };
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
