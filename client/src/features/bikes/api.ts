import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import type { BikeInsert, BikeUpdate } from "shared";

export function useBikes() {
  return useQuery({ queryKey: queryKeys.bikes, queryFn: api.listBikes });
}

export function useBike(id: string) {
  return useQuery({
    queryKey: queryKeys.bike(id),
    queryFn: () => api.getBike(id),
    enabled: !!id,
  });
}

export function useCreateBike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BikeInsert) => api.createBike(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bikes }),
  });
}

export function useUpdateBike(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BikeUpdate) => api.updateBike(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bikes });
      void qc.invalidateQueries({ queryKey: queryKeys.bike(id) });
    },
  });
}

export function useDeleteBike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBike(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.bikes });
      qc.removeQueries({ queryKey: queryKeys.bike(id) });
    },
  });
}
