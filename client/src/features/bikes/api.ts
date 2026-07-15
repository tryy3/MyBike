import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BikeInsert, BikeUpdate } from "shared";
import { graphqlFetch } from "@/lib/graphql";
import {
  BIKE_DETAIL_QUERY,
  BIKES_LIST_QUERY,
  CREATE_BIKE_MUTATION,
  DELETE_BIKE_MUTATION,
  UPDATE_BIKE_MUTATION,
  toBikeDetailGql,
  type BikeDetailGql,
  type BikeListItemGql,
} from "@/lib/graphql/operations";
import { queryKeys } from "@/lib/api";

export type BikeDetailWithStats = ReturnType<typeof toBikeDetailGql> & {
  rideStats: BikeDetailGql["rideStats"];
  maintenanceAlertCount: number;
};

export function useBikes() {
  return useQuery({
    queryKey: queryKeys.bikes,
    queryFn: async () => {
      const data = await graphqlFetch<{ bikes: BikeListItemGql[] }>(BIKES_LIST_QUERY);
      return data.bikes;
    },
  });
}

export function useBike(id: string) {
  return useQuery({
    queryKey: queryKeys.bike(id),
    queryFn: async (): Promise<BikeDetailWithStats> => {
      const data = await graphqlFetch<{ bike: BikeDetailGql }>(BIKE_DETAIL_QUERY, { id });
      return {
        ...toBikeDetailGql(data.bike),
        rideStats: data.bike.rideStats,
        maintenanceAlertCount: data.bike.maintenanceAlertCount,
      };
    },
    enabled: !!id,
  });
}

export function useCreateBike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BikeInsert) => {
      const data = await graphqlFetch<{ createBike: BikeListItemGql }>(CREATE_BIKE_MUTATION, {
        input,
      });
      return data.createBike;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bikes }),
  });
}

export function useUpdateBike(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BikeUpdate) => {
      const data = await graphqlFetch<{ updateBike: BikeListItemGql }>(UPDATE_BIKE_MUTATION, {
        id,
        input,
      });
      return data.updateBike;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bikes });
      void qc.invalidateQueries({ queryKey: queryKeys.bike(id) });
    },
  });
}

export function useDeleteBike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bikeId: string) => {
      await graphqlFetch<{ deleteBike: boolean }>(DELETE_BIKE_MUTATION, { id: bikeId });
    },
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.bikes });
      qc.removeQueries({ queryKey: queryKeys.bike(id) });
      qc.removeQueries({ queryKey: queryKeys.bikeMaintenance(id) });
    },
  });
}
