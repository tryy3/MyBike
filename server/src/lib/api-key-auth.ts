import { auth } from "./auth.js";

export const GRAPHQL_API_KEY_CONFIG_ID = "graphql";

export function extractApiKeyFromHeaders(
  headers: Headers | { get(name: string): string | null | undefined },
): string | null {
  const headerKey = headers.get("x-api-key")?.trim();
  if (headerKey) return headerKey;

  const authorization = headers.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() ?? null;
}

export function parseApiKeyPermissions(value: unknown): Record<string, string[]> | null {
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
      return parseApiKeyPermissions(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return null;
}

export interface VerifiedGraphQLApiKey {
  userId: string;
  permissions: Record<string, string[]> | null;
  token: string;
}

export async function verifyGraphQLApiKey(token: string): Promise<VerifiedGraphQLApiKey | null> {
  const result = await auth.api.verifyApiKey({
    body: {
      key: token,
      configId: GRAPHQL_API_KEY_CONFIG_ID,
    },
  });

  if (!result.valid || !result.key?.referenceId) {
    return null;
  }

  return {
    userId: result.key.referenceId,
    permissions: parseApiKeyPermissions(result.key.permissions),
    token,
  };
}
