import {
  MAINTENANCE_OVERDUE_PROGRESS_RATIO,
  maintenanceProgressRatio,
  type MaintenanceTaskKind,
  type MaintenanceTaskProgress,
  type MaintenanceTaskStatus,
  type MaintenanceTaskView,
  type MaintenanceTriggerMode,
} from "shared";
import type { MaintenanceTaskRow, ServiceRecordRow } from "../db/schema.js";

const MS_PER_DAY = 86_400_000;

export interface WearSnapshot {
  distanceMeters: number;
  movingTimeMinutes: number;
}

export interface DueContext {
  wear: WearSnapshot | null;
  lastServiceAt: number | null;
  lastServiceWear: WearSnapshot | null;
  taskCreatedAt: number;
}

export function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / MS_PER_DAY);
}

function isSnoozedByDistance(
  task: MaintenanceTaskRow,
  currentWearMeters: number,
  rawDue: boolean,
): boolean {
  if (!rawDue || task.snoozedUntilDistanceMeters == null) return false;
  return currentWearMeters < task.snoozedUntilDistanceMeters;
}

function isSnoozedByTime(task: MaintenanceTaskRow, nowMs: number, rawDue: boolean): boolean {
  if (!rawDue || task.snoozedUntilAt == null) return false;
  return nowMs < task.snoozedUntilAt;
}

function computePeriodicDue(
  task: MaintenanceTaskRow,
  ctx: DueContext,
  nowMs: number,
): { status: MaintenanceTaskStatus; progress: MaintenanceTaskProgress } {
  if (!ctx.wear) {
    return {
      status: "ok",
      progress: {
        distanceUsedMeters: null,
        distanceLimitMeters: task.distanceMeters,
        daysUsed: null,
        daysLimit: task.intervalDays,
        needsComponent: true,
      },
    };
  }

  const baselineWear = ctx.lastServiceWear?.distanceMeters ?? 0;
  const distanceUsed = Math.max(0, ctx.wear.distanceMeters - baselineWear);
  const baselineTime = ctx.lastServiceAt ?? ctx.taskCreatedAt;
  const daysUsed = daysBetween(baselineTime, nowMs);

  const mode = task.triggerMode ?? "distance";
  let distanceDue = false;
  let timeDue = false;

  if ((mode === "distance" || mode === "both") && task.distanceMeters != null) {
    distanceDue = distanceUsed >= task.distanceMeters;
  }
  if ((mode === "time" || mode === "both") && task.intervalDays != null) {
    timeDue = daysUsed >= task.intervalDays;
  }

  const rawDue = mode === "both" ? distanceDue || timeDue : mode === "time" ? timeDue : distanceDue;

  let snoozed = false;
  if (rawDue) {
    if (
      (mode === "distance" || mode === "both") &&
      isSnoozedByDistance(task, ctx.wear.distanceMeters, rawDue)
    ) {
      snoozed = true;
    }
    if ((mode === "time" || mode === "both") && isSnoozedByTime(task, nowMs, rawDue)) {
      snoozed = true;
    }
  }

  const progress: MaintenanceTaskProgress = {
    distanceUsedMeters: mode === "time" ? null : distanceUsed,
    distanceLimitMeters: mode === "time" ? null : task.distanceMeters,
    daysUsed: mode === "distance" ? null : daysUsed,
    daysLimit: mode === "distance" ? null : task.intervalDays,
    needsComponent: false,
  };

  const status = resolveDueStatus(rawDue, snoozed, progress);

  return { status, progress };
}

function computeEolDue(
  task: MaintenanceTaskRow,
  ctx: DueContext,
): { status: MaintenanceTaskStatus; progress: MaintenanceTaskProgress } {
  if (!ctx.wear || task.distanceMeters == null) {
    return {
      status: "ok",
      progress: {
        distanceUsedMeters: null,
        distanceLimitMeters: task.distanceMeters,
        daysUsed: null,
        daysLimit: null,
        needsComponent: true,
      },
    };
  }

  const wear = ctx.wear.distanceMeters;
  const rawDue = wear >= task.distanceMeters;
  const snoozed = isSnoozedByDistance(task, wear, rawDue);
  const progress: MaintenanceTaskProgress = {
    distanceUsedMeters: wear,
    distanceLimitMeters: task.distanceMeters,
    daysUsed: null,
    daysLimit: null,
    needsComponent: false,
  };

  const status = resolveDueStatus(rawDue, snoozed, progress);

  return { status, progress };
}

function resolveDueStatus(
  rawDue: boolean,
  snoozed: boolean,
  progress: MaintenanceTaskProgress,
): MaintenanceTaskStatus {
  if (!rawDue) return "ok";
  if (snoozed) return "snoozed";
  const ratio = maintenanceProgressRatio(progress);
  if (ratio != null && ratio > MAINTENANCE_OVERDUE_PROGRESS_RATIO) return "overdue";
  return "due";
}

export function computeTaskDueStatus(
  task: MaintenanceTaskRow,
  ctx: DueContext,
  nowMs = Date.now(),
): { status: MaintenanceTaskStatus; progress: MaintenanceTaskProgress | null } {
  if (!task.enabled || task.kind === "touch_up") {
    return { status: "ok", progress: null };
  }

  if (task.kind === "eol") {
    const result = computeEolDue(task, ctx);
    return result;
  }

  return computePeriodicDue(task, ctx, nowMs);
}

export function isAlertStatus(status: MaintenanceTaskStatus): boolean {
  return status === "due" || status === "overdue";
}

export function toMaintenanceTaskView(
  task: MaintenanceTaskRow,
  status: MaintenanceTaskStatus,
  progress: MaintenanceTaskProgress | null,
  lastCheckedAt: number | null,
): MaintenanceTaskView {
  return {
    id: task.id,
    bikeId: task.bikeId,
    source: task.source as MaintenanceTaskView["source"],
    templateKey: task.templateKey,
    kind: task.kind as MaintenanceTaskKind,
    title: task.title,
    description: task.description,
    componentCategory: task.componentCategory,
    triggerMode: task.triggerMode as MaintenanceTriggerMode | null,
    distanceMeters: task.distanceMeters,
    intervalDays: task.intervalDays,
    guideUrl: task.guideUrl,
    enabled: task.enabled,
    customized: task.customized,
    sortOrder: task.sortOrder,
    status,
    progress,
    lastCheckedAt,
    canDelete: task.source === "custom",
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function toServiceRecordView(row: ServiceRecordRow): import("shared").ServiceRecordView {
  return {
    id: row.id,
    taskId: row.taskId,
    bikeId: row.bikeId,
    componentId: row.componentId,
    action: row.action as import("shared").ServiceRecordView["action"],
    completedAt: row.completedAt,
    notes: row.notes,
    cost: row.cost,
    wearDistanceMeters: row.wearDistanceMeters,
    wearMovingTimeMinutes: row.wearMovingTimeMinutes,
    createdAt: row.createdAt,
  };
}
