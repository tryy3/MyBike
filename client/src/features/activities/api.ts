import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import type { ActivityUpdate } from "shared";

export function useBikeActivities(bikeId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.bikeActivities(bikeId),
    queryFn: ({ pageParam }) => api.listBikeActivities(bikeId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!bikeId,
  });
}

export function useUpdateActivity(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ActivityUpdate }) =>
      api.updateActivity(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bikeActivities(bikeId) });
      void qc.invalidateQueries({ queryKey: queryKeys.bikeStats(bikeId) });
    },
  });
}
