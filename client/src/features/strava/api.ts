import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StravaImportCommit } from "shared";
import { api, queryKeys } from "@/lib/api";

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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.stravaStatus });
      void qc.invalidateQueries({ queryKey: queryKeys.bikes });
      void qc.invalidateQueries({ queryKey: queryKeys.garageStats });
      void qc.invalidateQueries({ queryKey: ["stats", "bike"] });
    },
  });
}

export function useSyncStrava() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.syncStrava(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.stravaStatus });
      void qc.invalidateQueries({ queryKey: queryKeys.bikes });
      void qc.invalidateQueries({ queryKey: queryKeys.garageStats });
      void qc.invalidateQueries({ queryKey: ["stats", "bike"] });
    },
  });
}
