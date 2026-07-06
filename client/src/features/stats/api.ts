import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";

export function useGarageStats() {
  return useQuery({
    queryKey: queryKeys.garageStats,
    queryFn: () => api.getGarageStats(),
  });
}

export function useBikeStats(bikeId: string) {
  return useQuery({
    queryKey: queryKeys.bikeStats(bikeId),
    queryFn: () => api.getBikeStats(bikeId),
    enabled: !!bikeId,
  });
}
