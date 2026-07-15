import type { MaintenanceTaskView } from "shared";
import { listMaintenanceTasksForBike } from "../services/maintenance.js";
import type { GraphQLContext } from "./context.js";

/** Per-request cache: one batched load per bike for all maintenance GraphQL fields. */
export function getCachedMaintenanceTasks(
  context: GraphQLContext,
  bikeId: string,
  userId: string,
): Promise<MaintenanceTaskView[]> {
  if (!context.maintenanceTasksByBikeId) {
    context.maintenanceTasksByBikeId = new Map();
  }
  let pending = context.maintenanceTasksByBikeId.get(bikeId);
  if (!pending) {
    pending = listMaintenanceTasksForBike(bikeId, userId);
    context.maintenanceTasksByBikeId.set(bikeId, pending);
  }
  return pending;
}

export function countAlertsFromTasks(tasks: MaintenanceTaskView[]): number {
  return tasks.filter((task) => task.status === "due" || task.status === "overdue").length;
}

export function countAlertsForCategoryFromTasks(
  tasks: MaintenanceTaskView[],
  category: string,
): number {
  return tasks.filter(
    (task) =>
      task.componentCategory === category &&
      task.kind !== "touch_up" &&
      task.enabled &&
      (task.status === "due" || task.status === "overdue"),
  ).length;
}
