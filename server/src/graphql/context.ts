import type { YogaInitialContext } from "graphql-yoga";
import { auth } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";

export type GraphQLAuthMethod = "session" | "apiKey";

export interface GraphQLContext {
  userId: string | null;
  authMethod: GraphQLAuthMethod | null;
  permissions: Record<string, string[]> | null;
}

function extractApiKey(request: Request): string | null {
  const headerKey = request.headers.get("x-api-key")?.trim();
  if (headerKey) return headerKey;

  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() ?? null;
}

function parsePermissions(value: unknown): Record<string, string[]> | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const parsed: Record<string, string[]> = {};
    for (const [resource, actions] of Object.entries(record)) {
      if (Array.isArray(actions) && actions.every((action) => typeof action === "string")) {
        parsed[resource] = actions;
      }
    }
    return Object.keys(parsed).length > 0 ? parsed : null;
  }
  if (typeof value === "string") {
    try {
      return parsePermissions(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return null;
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

  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return { userId: null, authMethod: null, permissions: null };
  }

  const result = await auth.api.verifyApiKey({
    body: {
      key: apiKey,
      configId: "graphql",
    },
  });

  if (!result.valid || !result.key?.referenceId) {
    return { userId: null, authMethod: null, permissions: null };
  }

  return {
    userId: result.key.referenceId,
    authMethod: "apiKey",
    permissions: parsePermissions(result.key.permissions),
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
