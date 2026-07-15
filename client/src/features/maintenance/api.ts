import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MaintenanceTaskInsert, MaintenanceTaskUpdate } from "shared";
import { MAINTENANCE_WARNING_PROGRESS_RATIO, maintenanceProgressRatio } from "shared";
import { graphqlFetch } from "@/lib/graphql";
import {
  BIKE_MAINTENANCE_QUERY,
  COMPLETE_MAINTENANCE_TASK_MUTATION,
  CREATE_MAINTENANCE_TASK_MUTATION,
  DELETE_MAINTENANCE_TASK_MUTATION,
  REPLACE_MAINTENANCE_TASK_MUTATION,
  RESET_MAINTENANCE_TASK_MUTATION,
  SNOOZE_MAINTENANCE_TASK_MUTATION,
  TOGGLE_MAINTENANCE_TASK_MUTATION,
  TOGGLE_TOUCH_UP_MUTATION,
  CLEAR_TOUCH_UP_CHECKLIST_MUTATION,
  UPDATE_MAINTENANCE_TASK_MUTATION,
  type MaintenanceTaskGql,
} from "@/lib/graphql/operations";
import { queryKeys } from "@/lib/api";
import {
  invalidateMaintenanceData,
  isTaskDue,
  patchMaintenanceTaskInCache,
  syncMaintenanceAlertCountsToBikeCaches,
  type BikeMaintenanceData,
} from "./cache-sync";

export type { BikeMaintenanceData };
export { isTaskDue, dueTasksByCategoryFromTasks } from "./cache-sync";

export function useBikeMaintenance(bikeId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.bikeMaintenance(bikeId),
    queryFn: async (): Promise<BikeMaintenanceData> => {
      const data = await graphqlFetch<{
        bike: BikeMaintenanceData;
      }>(BIKE_MAINTENANCE_QUERY, { id: bikeId });
      const tasks = data.bike.maintenanceTasks;
      return {
        maintenanceTasks: tasks,
        serviceRecords: data.bike.serviceRecords,
        maintenanceAlertCount: tasks.filter((task) => isTaskDue(task)).length,
      };
    },
    enabled: !!bikeId && (options?.enabled ?? true),
  });
}

function invalidateMaintenance(qc: ReturnType<typeof useQueryClient>, bikeId: string) {
  invalidateMaintenanceData(qc, bikeId);
}

export function useCreateMaintenanceTask(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MaintenanceTaskInsert) => {
      await graphqlFetch(CREATE_MAINTENANCE_TASK_MUTATION, { bikeId, input });
    },
    onSuccess: () => invalidateMaintenance(qc, bikeId),
  });
}

export function useUpdateMaintenanceTask(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: MaintenanceTaskUpdate }) => {
      await graphqlFetch(UPDATE_MAINTENANCE_TASK_MUTATION, { id, input });
    },
    onSuccess: () => invalidateMaintenance(qc, bikeId),
  });
}

export function useToggleMaintenanceTask(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const data = await graphqlFetch<{ toggleMaintenanceTask: MaintenanceTaskGql }>(
        TOGGLE_MAINTENANCE_TASK_MUTATION,
        { id, enabled },
      );
      return data.toggleMaintenanceTask;
    },
    onSuccess: (updatedTask) => {
      const tasks = patchMaintenanceTaskInCache(qc, bikeId, updatedTask);
      if (tasks) {
        syncMaintenanceAlertCountsToBikeCaches(qc, bikeId, tasks);
        return;
      }
      invalidateMaintenance(qc, bikeId);
    },
  });
}

export function useDeleteMaintenanceTask(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await graphqlFetch(DELETE_MAINTENANCE_TASK_MUTATION, { id });
    },
    onSuccess: () => invalidateMaintenance(qc, bikeId),
  });
}

export function useResetMaintenanceTask(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await graphqlFetch(RESET_MAINTENANCE_TASK_MUTATION, { id });
    },
    onSuccess: () => invalidateMaintenance(qc, bikeId),
  });
}

export function useCompleteMaintenanceTask(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      await graphqlFetch(COMPLETE_MAINTENANCE_TASK_MUTATION, { id, input: { notes } });
    },
    onSuccess: () => invalidateMaintenance(qc, bikeId),
  });
}

export function useReplaceMaintenanceTask(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      newComponentId,
      resetWear,
      notes,
    }: {
      id: string;
      newComponentId?: string;
      resetWear?: boolean;
      notes?: string;
    }) => {
      await graphqlFetch(REPLACE_MAINTENANCE_TASK_MUTATION, {
        id,
        input: { newComponentId, resetWear, notes },
      });
    },
    onSuccess: () => invalidateMaintenance(qc, bikeId),
  });
}

export function useSnoozeMaintenanceTask(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      distanceMeters,
      days,
    }: {
      id: string;
      distanceMeters?: number;
      days?: number;
    }) => {
      await graphqlFetch(SNOOZE_MAINTENANCE_TASK_MUTATION, {
        id,
        input: { distanceMeters, days },
      });
    },
    onSuccess: () => invalidateMaintenance(qc, bikeId),
  });
}

export function useToggleTouchUp(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const data = await graphqlFetch<{ toggleTouchUpCheckItem: MaintenanceTaskGql }>(
        TOGGLE_TOUCH_UP_MUTATION,
        { taskId },
      );
      return data.toggleTouchUpCheckItem;
    },
    onSuccess: (updatedTask) => {
      const tasks = patchMaintenanceTaskInCache(qc, bikeId, updatedTask);
      if (tasks) {
        syncMaintenanceAlertCountsToBikeCaches(qc, bikeId, tasks);
        return;
      }
      invalidateMaintenance(qc, bikeId);
    },
  });
}

export function useClearTouchUpChecklist(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const data = await graphqlFetch<{ clearTouchUpChecklist: MaintenanceTaskGql[] }>(
        CLEAR_TOUCH_UP_CHECKLIST_MUTATION,
        { bikeId },
      );
      return data.clearTouchUpChecklist;
    },
    onSuccess: () => invalidateMaintenance(qc, bikeId),
  });
}

export function formatTaskProgress(task: MaintenanceTaskGql): string | null {
  const p = task.progress;
  if (!p) return null;
  const parts: string[] = [];
  if (p.distanceUsedMeters != null && p.distanceLimitMeters != null) {
    parts.push(
      `${(p.distanceUsedMeters / 1000).toFixed(0)} / ${(p.distanceLimitMeters / 1000).toFixed(0)} km`,
    );
  }
  if (p.daysUsed != null && p.daysLimit != null) {
    parts.push(`${p.daysUsed} / ${p.daysLimit} days`);
  }
  if (p.needsComponent) parts.push("Needs active component");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Highest progress ratio across distance/time triggers (for progress bars). */
export function taskProgressPercent(task: MaintenanceTaskGql): number | null {
  const ratio = maintenanceProgressRatio(task.progress);
  return ratio == null ? null : ratio * 100;
}

export type TaskVisualUrgency = "muted" | "ok" | "warning" | "due" | "overdue" | "snoozed";

/** Ring/stripe urgency — combines server status with client “due soon” band for ok tasks. */
export function taskVisualUrgency(task: MaintenanceTaskGql): TaskVisualUrgency {
  if (!task.enabled) return "muted";
  if (task.status === "snoozed") return "snoozed";
  if (task.status === "overdue") return "overdue";
  if (task.status === "due") return "due";
  const ratio = maintenanceProgressRatio(task.progress);
  if (ratio == null) return "muted";
  if (ratio >= MAINTENANCE_WARNING_PROGRESS_RATIO) return "warning";
  return "ok";
}

export function taskShowsDueSoonBadge(task: MaintenanceTaskGql): boolean {
  if (!task.enabled || task.status !== "ok") return false;
  const ratio = maintenanceProgressRatio(task.progress);
  return ratio != null && ratio >= MAINTENANCE_WARNING_PROGRESS_RATIO && ratio < 1;
}
