import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import type {
  ComponentOptionInsert,
  ComponentOptionUpdate,
  ComponentSlotInsert,
  ComponentSlotUpdate,
} from "shared";

// Slot mutations invalidate the parent bike detail.
export function useCreateSlot(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ComponentSlotInsert) => api.createSlot(bikeId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

export function useUpdateSlot(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ComponentSlotUpdate;
    }) => api.updateSlot(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

export function useDeleteSlot(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSlot(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

// --- Options ---------------------------------------------------------------

export function useCreateOption(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      slotId,
      data,
    }: {
      slotId: string;
      data: ComponentOptionInsert;
    }) => api.createOption(slotId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

export function useUpdateOption(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ComponentOptionUpdate;
    }) => api.updateOption(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

export function useDeleteOption(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteOption(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

export function useActivateOption(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.activateOption(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}