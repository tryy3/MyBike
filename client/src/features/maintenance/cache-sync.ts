import type { QueryClient } from "@tanstack/react-query";
import type { BikeListItemGql, MaintenanceTaskGql } from "@/lib/graphql/operations";
import { queryKeys } from "@/lib/api";
import type { BikeDetailWithStats } from "@/features/bikes/api";

export interface BikeMaintenanceData {
  maintenanceAlertCount: number;
  maintenanceTasks: MaintenanceTaskGql[];
  serviceRecords: import("@/lib/graphql/operations").ServiceRecordGql[];
}

export function isTaskDue(task: MaintenanceTaskGql): boolean {
  return task.status === "due" || task.status === "overdue";
}

export function dueTasksByCategoryFromTasks(
  tasks: MaintenanceTaskGql[],
): Map<string, MaintenanceTaskGql[]> {
  const map = new Map<string, MaintenanceTaskGql[]>();
  for (const task of tasks) {
    if (!task.componentCategory || task.kind === "touch_up" || !task.enabled) continue;
    if (!isTaskDue(task)) continue;
    const list = map.get(task.componentCategory) ?? [];
    list.push(task);
    map.set(task.componentCategory, list);
  }
  return map;
}

export function maintenanceAlertByCategoryFromTasks(
  tasks: MaintenanceTaskGql[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const task of tasks) {
    if (!task.componentCategory || task.kind === "touch_up" || !task.enabled) continue;
    if (!isTaskDue(task)) continue;
    map.set(task.componentCategory, (map.get(task.componentCategory) ?? 0) + 1);
  }
  return map;
}

function countAlerts(tasks: MaintenanceTaskGql[]): number {
  return tasks.filter((task) => isTaskDue(task)).length;
}

/** Patch maintenance task list in cache — no network refetch. */
export function patchMaintenanceTaskInCache(
  qc: QueryClient,
  bikeId: string,
  updatedTask: MaintenanceTaskGql,
): MaintenanceTaskGql[] | null {
  let nextTasks: MaintenanceTaskGql[] | null = null;

  qc.setQueryData<BikeMaintenanceData>(queryKeys.bikeMaintenance(bikeId), (old) => {
    if (!old) return old;
    nextTasks = old.maintenanceTasks.map((task) =>
      task.id === updatedTask.id ? { ...task, ...updatedTask } : task,
    );
    return {
      ...old,
      maintenanceTasks: nextTasks,
      maintenanceAlertCount: countAlerts(nextTasks),
    };
  });

  return nextTasks;
}

/** Copy alert counts from maintenance cache into bike detail + garage list caches. */
export function syncMaintenanceAlertCountsToBikeCaches(
  qc: QueryClient,
  bikeId: string,
  tasks?: MaintenanceTaskGql[] | null,
): void {
  const maintenance =
    tasks != null
      ? { maintenanceTasks: tasks, maintenanceAlertCount: countAlerts(tasks) }
      : qc.getQueryData<BikeMaintenanceData>(queryKeys.bikeMaintenance(bikeId));

  if (!maintenance) return;

  const alertCount = maintenance.maintenanceAlertCount;
  const byCategory = maintenanceAlertByCategoryFromTasks(maintenance.maintenanceTasks);

  qc.setQueryData<BikeDetailWithStats>(queryKeys.bike(bikeId), (old) => {
    if (!old) return old;
    return {
      ...old,
      maintenanceAlertCount: alertCount,
      maintenanceAlertByCategory: byCategory,
    };
  });

  qc.setQueryData<BikeListItemGql[]>(queryKeys.bikes, (old) => {
    if (!old) return old;
    return old.map((bike) =>
      bike.id === bikeId ? { ...bike, maintenanceAlertCount: alertCount } : bike,
    );
  });
}

/** Refetch maintenance + alert badges after structural changes (create, delete, complete, …). */
export function invalidateMaintenanceData(qc: QueryClient, bikeId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.bikeMaintenance(bikeId), exact: true });
  void qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId), exact: true });
  void qc.invalidateQueries({ queryKey: queryKeys.bikes, exact: true });
}

/** Refetch bike detail + maintenance when component wear or active parts change. */
export function invalidateWearDependentBikeQueries(qc: QueryClient, bikeId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.bike(bikeId), exact: true });
  void qc.invalidateQueries({ queryKey: queryKeys.bikeMaintenance(bikeId), exact: true });
}

/** Refetch all bike-scoped caches after Strava sync affects wear across bikes. */
export function invalidateAllBikeWearQueries(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["bike"] });
  void qc.invalidateQueries({ queryKey: queryKeys.bikes, exact: true });
}
