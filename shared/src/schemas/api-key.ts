import { z } from "zod";

export const GRAPHQL_API_KEY_SCOPES = {
  read: { graphql: ["read"] },
  write: { graphql: ["read", "write"] },
  full: { graphql: ["read", "write", "delete"] },
} as const;

export type GraphQLApiKeyScopeId = keyof typeof GRAPHQL_API_KEY_SCOPES;

export const graphQLApiKeyScopeIdSchema = z.enum(["read", "write", "full"]);

export const apiKeyCreateMetadataSchema = z.object({
  scope: graphQLApiKeyScopeIdSchema.default("read"),
});

export function scopeFromApiKeyMetadata(metadata: unknown): GraphQLApiKeyScopeId {
  const parsed = apiKeyCreateMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data.scope : "read";
}

export const GRAPHQL_API_KEY_SCOPE_LABELS: Record<GraphQLApiKeyScopeId, string> = {
  read: "Read-only",
  write: "Read + write",
  full: "Full access",
};

export const GRAPHQL_API_KEY_SCOPE_DESCRIPTIONS: Record<GraphQLApiKeyScopeId, string> = {
  read: "Fetch bikes, components, and stats via GraphQL queries",
  write: "Read data and create or update bikes and components",
  full: "Read, write, and delete bikes and components",
};

export type GraphQLApiKeyPermissions = (typeof GRAPHQL_API_KEY_SCOPES)[GraphQLApiKeyScopeId];

export function permissionsForScope(scope: GraphQLApiKeyScopeId): Record<string, string[]> {
  const permissions = GRAPHQL_API_KEY_SCOPES[scope];
  return {
    graphql: [...permissions.graphql],
  };
}

export function scopeFromPermissions(
  permissions: Record<string, string[]> | null | undefined,
): GraphQLApiKeyScopeId | null {
  if (!permissions?.graphql?.length) return null;
  const actions = [...permissions.graphql].sort().join(",");
  if (actions === "read") return "read";
  if (actions === "read,write") return "write";
  if (actions === "delete,read,write") return "full";
  return null;
}
