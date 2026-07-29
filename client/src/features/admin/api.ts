import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api";
import { graphqlFetch } from "@/lib/graphql";
import {
  ADMIN_CONFIG_AUDIT_QUERY,
  ADMIN_SETTINGS_QUERY,
  ADMIN_USERS_QUERY,
  ASSIGN_USER_ROLE_MUTATION,
  RESTART_SERVER_MUTATION,
  UPDATE_ADMIN_SETTINGS_MUTATION,
  type AdminConfigAuditEntryGql,
  type AdminSettingsPayloadGql,
  type AdminUserGql,
  type AdminUserRoleGql,
} from "@/lib/graphql/operations";

export const adminQueryKeys = {
  settings: queryKeys.adminSettings,
  users: queryKeys.adminUsers,
  audit: queryKeys.adminConfigAudit,
} as const;

export interface UpdateAdminSettingInput {
  key: string;
  value: unknown;
}

export function useAdminSettings(options?: {
  enabled?: boolean;
  retry?: boolean | number;
  staleTime?: number;
}) {
  return useQuery({
    queryKey: adminQueryKeys.settings,
    queryFn: async () => {
      const data = await graphqlFetch<{ adminSettings: AdminSettingsPayloadGql }>(
        ADMIN_SETTINGS_QUERY,
      );
      return data.adminSettings;
    },
    enabled: options?.enabled ?? true,
    retry: options?.retry,
    staleTime: options?.staleTime,
  });
}

export function useCanAccessAdmin() {
  return useAdminSettings({ retry: false, staleTime: 60_000 });
}

export function useUpdateAdminSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: UpdateAdminSettingInput[]) => {
      const data = await graphqlFetch<{ updateAdminSettings: AdminSettingsPayloadGql }>(
        UPDATE_ADMIN_SETTINGS_MUTATION,
        { inputs },
      );
      return data.updateAdminSettings;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: adminQueryKeys.settings }),
        qc.invalidateQueries({ queryKey: ["admin", "audit"] }),
      ]);
    },
  });
}

export function useRestartServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const data = await graphqlFetch<{ restartServer: boolean }>(RESTART_SERVER_MUTATION);
      return data.restartServer;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: adminQueryKeys.users,
    queryFn: async () => {
      const data = await graphqlFetch<{ adminUsers: AdminUserGql[] }>(ADMIN_USERS_QUERY);
      return data.adminUsers;
    },
  });
}

export function useAssignUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; role: AdminUserRoleGql }) => {
      const data = await graphqlFetch<{ assignUserRole: AdminUserGql }>(
        ASSIGN_USER_ROLE_MUTATION,
        input,
      );
      return data.assignUserRole;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: adminQueryKeys.users }),
        qc.invalidateQueries({ queryKey: ["admin", "audit"] }),
      ]);
    },
  });
}

export function useAdminConfigAudit(limit = 50) {
  return useQuery({
    queryKey: adminQueryKeys.audit(limit),
    queryFn: async () => {
      const data = await graphqlFetch<{ adminConfigAudit: AdminConfigAuditEntryGql[] }>(
        ADMIN_CONFIG_AUDIT_QUERY,
        { limit },
      );
      return data.adminConfigAudit;
    },
  });
}
