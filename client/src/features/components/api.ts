import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import type {
  ComponentInsert,
  ComponentUpdate,
} from "shared";

// All component mutations invalidate the parent bike detail.
export function useCreateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ComponentInsert) => api.createComponent(bikeId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

export function useUpdateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ComponentUpdate;
    }) => api.updateComponent(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

export function useDeleteComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteComponent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

export function useActivateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.activateComponent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}