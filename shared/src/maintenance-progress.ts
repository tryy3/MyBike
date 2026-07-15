import type { MaintenanceTaskProgress } from "./schemas/maintenance.js";

/** Progress ratio at which the UI shows amber “due soon” styling (client-only for ok tasks). */
export const MAINTENANCE_WARNING_PROGRESS_RATIO = 0.75;

/** Progress ratio above which a due task becomes overdue (server + client). */
export const MAINTENANCE_OVERDUE_PROGRESS_RATIO = 1.25;

/** Highest distance/time ratio for a task's progress, or null when not computable. */
export function maintenanceProgressRatio(
  progress: MaintenanceTaskProgress | null | undefined,
): number | null {
  if (!progress) return null;
  const ratios: number[] = [];
  if (
    progress.distanceUsedMeters != null &&
    progress.distanceLimitMeters != null &&
    progress.distanceLimitMeters > 0
  ) {
    ratios.push(progress.distanceUsedMeters / progress.distanceLimitMeters);
  }
  if (progress.daysUsed != null && progress.daysLimit != null && progress.daysLimit > 0) {
    ratios.push(progress.daysUsed / progress.daysLimit);
  }
  return ratios.length > 0 ? Math.max(...ratios) : null;
}
