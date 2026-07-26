import type { MaintenanceTaskView } from "shared";
import { listMaintenanceTasksForBike } from "../services/maintenance.js";
import { getCachedBike } from "./bike-cache.js";
import type { GraphQLContext } from "./context.js";
import { getCachedStravaWearByBikeId } from "./wear-cache.js";

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
    const load = async () => {
      await getCachedBike(context, bikeId, userId);
      const stravaWearByComponentId = await getCachedStravaWearByBikeId(context, bikeId);
      return listMaintenanceTasksForBike(bikeId, userId, {
        stravaWearByComponentId,
        skipRequireBike: true,
      });
    };
    pending = context.timing?.enabled
      ? context.timing.time(`maintenanceTasks:${bikeId.slice(0, 8)}`, load)
      : load();
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
