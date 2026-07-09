import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ComponentInsert, ComponentReorder, ComponentUpdate } from "shared";
import { api, queryKeys } from "@/lib/api";
import { graphqlFetch } from "@/lib/graphql";
import {
  ACTIVATE_COMPONENT_MUTATION,
  CREATE_COMPONENT_MUTATION,
  DELETE_COMPONENT_MUTATION,
  FIELD_SUGGESTIONS_QUERY,
  REORDER_COMPONENTS_MUTATION,
  UPDATE_COMPONENT_MUTATION,
  type BikeDetailGql,
} from "@/lib/graphql/operations";
import type { BikeDetailWithStats } from "@/features/bikes/api";

function invalidateComponentQueries(qc: QueryClient, bikeId: string) {
  void qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId) });
  void qc.invalidateQueries({ queryKey: queryKeys.fieldSuggestions });
}

export function useFieldSuggestions() {
  return useQuery({
    queryKey: queryKeys.fieldSuggestions,
    queryFn: async () => {
      const data = await graphqlFetch<{
        fieldSuggestions: {
          name: string[];
          brand: string[];
          model: string[];
          purchaseStore: string[];
        };
      }>(FIELD_SUGGESTIONS_QUERY);
      return data.fieldSuggestions;
    },
  });
}

export function useCreateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ComponentInsert) => {
      const data = await graphqlFetch<{ createComponent: BikeDetailGql["components"][number] }>(
        CREATE_COMPONENT_MUTATION,
        { bikeId, input },
      );
      return data.createComponent;
    },
    onSuccess: () => invalidateComponentQueries(qc, bikeId),
  });
}

export function useUpdateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ComponentUpdate }) => {
      const result = await graphqlFetch<{ updateComponent: BikeDetailGql["components"][number] }>(
        UPDATE_COMPONENT_MUTATION,
        { id, input: data },
      );
      return result.updateComponent;
    },
    onSuccess: () => invalidateComponentQueries(qc, bikeId),
  });
}

export function useDeleteComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await graphqlFetch<{ deleteComponent: boolean }>(DELETE_COMPONENT_MUTATION, { id });
    },
    onSuccess: () => invalidateComponentQueries(qc, bikeId),
  });
}

export function useActivateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const data = await graphqlFetch<{ activateComponent: { id: string; isActive: boolean } }>(
        ACTIVATE_COMPONENT_MUTATION,
        { id },
      );
      return data.activateComponent;
    },
    onSuccess: () => invalidateComponentQueries(qc, bikeId),
  });
}

export function useReorderComponents(bikeId: string) {
  const qc = useQueryClient();
  const queryKey = queryKeys.bike(bikeId);
  return useMutation({
    mutationFn: async (data: ComponentReorder) => {
      await graphqlFetch<{ reorderComponents: boolean }>(REORDER_COMPONENTS_MUTATION, {
        bikeId,
        category: data.category,
        orderedIds: data.orderedIds,
      });
    },
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<BikeDetailWithStats>(queryKey);
      if (previous) {
        const order = new Map(data.orderedIds.map((id, i) => [id, i]));
        const optimistic: BikeDetailWithStats = {
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

export function useImportComponents(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ csv, dryRun = false }: { csv: string; dryRun?: boolean }) =>
      api.importComponents(bikeId, csv, dryRun),
    onSuccess: (data, vars) => {
      if (!vars.dryRun) invalidateComponentQueries(qc, bikeId);
    },
  });
}
