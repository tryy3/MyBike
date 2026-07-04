import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import type { BikeDetail, ComponentInsert, ComponentReorder, ComponentUpdate } from "shared";

// All component mutations invalidate the parent bike detail.
export function useFieldSuggestions() {
  return useQuery({
    queryKey: queryKeys.fieldSuggestions,
    queryFn: () => api.getFieldSuggestions(),
  });
}

export function useCreateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ComponentInsert) => api.createComponent(bikeId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) });
      void qc.invalidateQueries({ queryKey: queryKeys.fieldSuggestions });
    },
  });
}

export function useUpdateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ComponentUpdate }) =>
      api.updateComponent(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) });
      void qc.invalidateQueries({ queryKey: queryKeys.fieldSuggestions });
    },
  });
}

export function useDeleteComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteComponent(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) });
      void qc.invalidateQueries({ queryKey: queryKeys.fieldSuggestions });
    },
  });
}

export function useActivateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.activateComponent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) }),
  });
}

export function useReorderComponents(bikeId: string) {
  const qc = useQueryClient();
  const queryKey = queryKeys.bike(bikeId);
  return useMutation({
    mutationFn: (data: ComponentReorder) => api.reorderComponents(bikeId, data),
    // Optimistic update: rewrite the sortOrder of the affected category's
    // components before the server responds so the list follows the cursor.
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<BikeDetail>(queryKey);
      if (previous) {
        const order = new Map(data.orderedIds.map((id, i) => [id, i]));
        const optimistic: BikeDetail = {
          ...previous,
          components: previous.components.map((c) =>
            c.category === data.category && order.has(c.id)
              ? { ...c, sortOrder: order.get(c.id)! }
              : c,
          ),
        };
        qc.setQueryData(queryKey, optimistic);
      }
      return { previous };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });
}

// CSV upsert import. With `dryRun: true` the server validates and reports
// `{ inserted, updated }` without committing — used for the pre-import
// confirmation popup. `error.details` carries the per-row
// `{ row, message }[]` list on failure.
export function useImportComponents(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ csv, dryRun = false }: { csv: string; dryRun?: boolean }) =>
      api.importComponents(bikeId, csv, dryRun),
    onSuccess: (data, vars) => {
      // Only invalidate when the import actually committed.
      if (!vars.dryRun) {
        void qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) });
      }
    },
  });
}
