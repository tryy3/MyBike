import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { StravaImportCommit } from "shared";
import { api, queryKeys } from "@/lib/api";

function invalidateStravaDerivedQueries(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.stravaStatus });
  void qc.invalidateQueries({ queryKey: queryKeys.bikes });
  void qc.invalidateQueries({ queryKey: queryKeys.garageStats });
  void qc.invalidateQueries({ queryKey: ["stats", "bike"] });
  void qc.invalidateQueries({ queryKey: ["activities", "bike"] });
}

export function useStravaStatus() {
  return useQuery({
    queryKey: queryKeys.stravaStatus,
    queryFn: () => api.getStravaStatus(),
  });
}

export function useStravaConnect() {
  return useMutation({
    mutationFn: () => api.getStravaConnectUrl(),
  });
}

export function usePreviewStravaImport() {
  return useMutation({
    mutationFn: () => api.previewStravaImport(),
  });
}

export function useCommitStravaImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StravaImportCommit) => api.commitStravaImport(data),
    onSuccess: () => invalidateStravaDerivedQueries(qc),
  });
}

export function useSyncStrava() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.syncStrava(),
    onSuccess: () => invalidateStravaDerivedQueries(qc),
  });
}

export function useBackfillStravaComponents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.backfillStravaComponents(),
    onSuccess: () => invalidateStravaDerivedQueries(qc),
  });
}

export function useDisconnectStrava() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.disconnectStrava(),
    onSuccess: () => {
      invalidateStravaDerivedQueries(qc);
    },
  });
}
