import type { AuthInfo, ServerContext } from "@modelcontextprotocol/server";
import { HttpError } from "../lib/errors.js";

export interface McpAuthContext {
  userId: string;
  permissions: Record<string, string[]> | null;
  token: string;
}

const MCP_AUTH_EXTRA_KEY = "mybikeAuth";

export function toAuthInfo(auth: McpAuthContext): AuthInfo {
  return {
    token: auth.token,
    clientId: auth.userId,
    scopes: auth.permissions?.graphql ?? [],
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    extra: { [MCP_AUTH_EXTRA_KEY]: auth },
  };
}

export function getMcpAuth(ctx: ServerContext): McpAuthContext {
  const extra = ctx.http?.authInfo?.extra?.[MCP_AUTH_EXTRA_KEY];
  if (!extra || typeof extra !== "object" || extra === null) {
    throw new HttpError(401, "Unauthorized");
  }
  const auth = extra as McpAuthContext;
  if (typeof auth.userId !== "string" || typeof auth.token !== "string") {
    throw new HttpError(401, "Unauthorized");
  }
  return auth;
}

export function requireReadPermission(auth: McpAuthContext): string {
  const actions = auth.permissions?.graphql ?? [];
  if (!actions.includes("read")) {
    throw new HttpError(403, "API key lacks required permission");
  }
  return auth.userId;
}

export function toGraphQLContext(auth: McpAuthContext) {
  return {
    userId: auth.userId,
    authMethod: "apiKey" as const,
    permissions: auth.permissions,
  };
}
