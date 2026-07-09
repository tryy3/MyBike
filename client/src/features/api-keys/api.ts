import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GRAPHQL_API_KEY_SCOPE_LABELS, type GraphQLApiKeyScopeId } from "shared";
import { authClient } from "@/lib/auth-client";
import { queryKeys } from "@/lib/api";

const API_KEY_CONFIG_ID = "graphql";

export type ListedApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  createdAt: Date | string;
  permissions?: Record<string, string[]> | string | null;
};

export function useApiKeys() {
  return useQuery({
    queryKey: queryKeys.apiKeys,
    queryFn: async () => {
      const result = await authClient.apiKey.list({
        query: { configId: API_KEY_CONFIG_ID },
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to load API keys");
      }
      return result.data?.apiKeys ?? [];
    },
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; scope: GraphQLApiKeyScopeId }) => {
      const result = await authClient.apiKey.create({
        configId: API_KEY_CONFIG_ID,
        name: input.name,
        metadata: { scope: input.scope },
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to create API key");
      }
      if (!result.data?.key) {
        throw new Error("API key was not returned");
      }
      return result.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      const result = await authClient.apiKey.delete({
        configId: API_KEY_CONFIG_ID,
        keyId,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to revoke API key");
      }
      return result.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
  });
}

export function formatApiKeyLabel(key: ListedApiKey): string {
  if (key.start) return `${key.prefix ?? "mbk_"}${key.start}…`;
  if (key.name) return key.name;
  return "API key";
}

export function scopeLabelForKey(key: ListedApiKey): string {
  let permissions: Record<string, string[]> | null | undefined;
  if (typeof key.permissions === "string") {
    try {
      permissions = JSON.parse(key.permissions) as Record<string, string[]>;
    } catch {
      permissions = null;
    }
  } else {
    permissions = key.permissions ?? null;
  }

  const actions = permissions?.graphql ?? [];
  if (actions.length === 1 && actions[0] === "read") {
    return GRAPHQL_API_KEY_SCOPE_LABELS.read;
  }
  if (actions.includes("delete")) {
    return GRAPHQL_API_KEY_SCOPE_LABELS.full;
  }
  if (actions.includes("write")) {
    return GRAPHQL_API_KEY_SCOPE_LABELS.write;
  }
  return "Custom";
}
