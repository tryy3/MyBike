import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  MAINTENANCE_TEMPLATE_BY_KEY,
  MAINTENANCE_TEMPLATES,
  SNOOZE_DISTANCE_PRESETS_METERS,
  SNOOZE_TIME_PRESETS_DAYS,
  componentUpdateSchema,
  type CompleteMaintenanceInput,
  type MaintenanceTaskInsert,
  type MaintenanceTaskUpdate,
  type MaintenanceTaskView,
  type ReplaceMaintenanceInput,
  type ServiceRecordView,
  type SnoozeMaintenanceInput,
} from "shared";
import { db } from "../db/index.js";
import {
  bikes,
  components,
  maintenanceChecklistState,
  maintenanceTasks,
  serviceRecords,
  type MaintenanceTaskRow,
} from "../db/schema.js";
import { getStravaWearByComponentId, displayWear } from "../lib/component-wear.js";
import {
  computeTaskDueStatus,
  isAlertStatus,
  toMaintenanceTaskView,
  toServiceRecordView,
  type DueContext,
  type WearSnapshot,
} from "../lib/maintenance-due.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireBike } from "./bikes.js";
import { activateComponent, requireComponent, updateComponent } from "./components.js";

function templateToRow(bikeId: string, template: (typeof MAINTENANCE_TEMPLATES)[number]) {
  return {
    bikeId,
    source: "builtin" as const,
    templateKey: template.templateKey,
    kind: template.kind,
    title: template.title,
    description: template.description,
    componentCategory: template.componentCategory,
    triggerMode: template.triggerMode,
    distanceMeters: template.distanceMeters,
    intervalDays: template.intervalDays,
    guideUrl: template.guideUrl,
    enabled: true,
    customized: false,
    sortOrder: template.sortOrder,
  };
}

function templateOwnedFieldsFromTemplate(template: (typeof MAINTENANCE_TEMPLATES)[number]) {
  return {
    title: template.title,
    description: template.description,
    componentCategory: template.componentCategory,
    triggerMode: template.triggerMode,
    distanceMeters: template.distanceMeters,
    intervalDays: template.intervalDays,
    guideUrl: template.guideUrl,
  };
}

function assertBuiltinUpdateAllowed(
  existing: MaintenanceTaskRow,
  update: MaintenanceTaskUpdate,
): void {
  const locked: { field: keyof MaintenanceTaskUpdate; label: string }[] = [
    { field: "title", label: "title" },
    { field: "description", label: "description" },
    { field: "componentCategory", label: "component category" },
    { field: "triggerMode", label: "trigger mode" },
    { field: "sortOrder", label: "sort order" },
  ];

  for (const { field, label } of locked) {
    if (update[field] === undefined) continue;
    const next = update[field];
    const current = existing[field];
    if (next !== current) {
      throw badRequest(`Built-in task ${label} cannot be changed`, {
        code: "BUILTIN_FIELD_LOCKED",
      });
    }
  }

  if (existing.kind === "touch_up") {
    if (update.distanceMeters !== undefined || update.intervalDays !== undefined) {
      throw badRequest("Touch-up tasks have no service intervals", {
        code: "BUILTIN_FIELD_LOCKED",
      });
    }
  }
}

function isBuiltinUserCustomization(
  existing: MaintenanceTaskRow,
  update: MaintenanceTaskUpdate,
): boolean {
  if (update.distanceMeters !== undefined && update.distanceMeters !== existing.distanceMeters) {
    return true;
  }
  if (update.intervalDays !== undefined && update.intervalDays !== existing.intervalDays) {
    return true;
  }
  if (update.guideUrl !== undefined && update.guideUrl !== existing.guideUrl) {
    return true;
  }
  return false;
}

type ComponentRow = typeof components.$inferSelect;

interface BikeMaintenanceRaw {
  stravaWearByComponentId: Map<string, WearSnapshot>;
  activeByCategory: Map<string, ComponentRow>;
  lastServiceByTaskId: Map<string, typeof serviceRecords.$inferSelect>;
  checklistLastCheckedByTaskId: Map<string, number>;
}

async function loadBikeMaintenanceRaw(
  bikeId: string,
  tasks: MaintenanceTaskRow[],
): Promise<BikeMaintenanceRaw> {
  const touchUpTaskIds = tasks.filter((task) => task.kind === "touch_up").map((task) => task.id);

  const [stravaWearByComponentId, activeComponents, serviceRecordRows, checklistRows] =
    await Promise.all([
      getStravaWearByComponentId(bikeId),
      db
        .select()
        .from(components)
        .where(and(eq(components.bikeId, bikeId), eq(components.isActive, true)))
        .all(),
      db
        .select()
        .from(serviceRecords)
        .where(eq(serviceRecords.bikeId, bikeId))
        .orderBy(desc(serviceRecords.completedAt))
        .all(),
      touchUpTaskIds.length > 0
        ? db
            .select()
            .from(maintenanceChecklistState)
            .where(inArray(maintenanceChecklistState.taskId, touchUpTaskIds))
            .all()
        : Promise.resolve([]),
    ]);

  const activeByCategory = new Map<string, ComponentRow>();
  for (const component of activeComponents) {
    activeByCategory.set(component.category, component);
  }

  const lastServiceByTaskId = new Map<string, typeof serviceRecords.$inferSelect>();
  for (const record of serviceRecordRows) {
    if (record.taskId && !lastServiceByTaskId.has(record.taskId)) {
      lastServiceByTaskId.set(record.taskId, record);
    }
  }

  const checklistLastCheckedByTaskId = new Map<string, number>();
  for (const row of checklistRows) {
    if (row.lastCheckedAt != null) {
      checklistLastCheckedByTaskId.set(row.taskId, row.lastCheckedAt);
    }
  }

  return {
    stravaWearByComponentId,
    activeByCategory,
    lastServiceByTaskId,
    checklistLastCheckedByTaskId,
  };
}

function resolveWearForCategory(
  category: string | null,
  raw: BikeMaintenanceRaw,
): WearSnapshot | null {
  if (!category) return null;
  const active = raw.activeByCategory.get(category);
  if (!active) return null;
  const stravaWear = raw.stravaWearByComponentId.get(active.id);
  return displayWear(active.distanceMeters, active.movingTimeMinutes, stravaWear);
}

function buildDueContext(task: MaintenanceTaskRow, raw: BikeMaintenanceRaw): DueContext {
  const wear = resolveWearForCategory(task.componentCategory, raw);
  const last = raw.lastServiceByTaskId.get(task.id) ?? null;
  return {
    wear,
    lastServiceAt: last?.completedAt ?? null,
    lastServiceWear:
      last?.wearDistanceMeters != null
        ? {
            distanceMeters: last.wearDistanceMeters,
            movingTimeMinutes: last.wearMovingTimeMinutes ?? 0,
          }
        : null,
    taskCreatedAt: task.createdAt,
  };
}

function enrichTaskFromRaw(task: MaintenanceTaskRow, raw: BikeMaintenanceRaw): MaintenanceTaskView {
  if (task.kind === "touch_up") {
    return toMaintenanceTaskView(
      task,
      "ok",
      null,
      raw.checklistLastCheckedByTaskId.get(task.id) ?? null,
    );
  }

  const ctx = buildDueContext(task, raw);
  const { status, progress } = computeTaskDueStatus(task, ctx);
  return toMaintenanceTaskView(task, status, progress, null);
}

async function enrichTasksForBike(
  bikeId: string,
  tasks: MaintenanceTaskRow[],
): Promise<MaintenanceTaskView[]> {
  if (tasks.length === 0) return [];
  const raw = await loadBikeMaintenanceRaw(bikeId, tasks);
  return tasks.map((task) => enrichTaskFromRaw(task, raw));
}

async function enrichSingleTask(task: MaintenanceTaskRow): Promise<MaintenanceTaskView> {
  const [view] = await enrichTasksForBike(task.bikeId, [task]);
  return view!;
}

export async function seedMaintenanceTasksForBike(bikeId: string): Promise<void> {
  const values = MAINTENANCE_TEMPLATES.map((template) => templateToRow(bikeId, template));
  if (values.length === 0) return;
  await db.insert(maintenanceTasks).values(values).run();
}

export async function syncMaintenanceTemplates(): Promise<{ inserted: number; updated: number }> {
  const allBikes = await db.select({ id: bikes.id }).from(bikes).all();
  let inserted = 0;
  let updated = 0;

  for (const bike of allBikes) {
    const existing = await db
      .select()
      .from(maintenanceTasks)
      .where(and(eq(maintenanceTasks.bikeId, bike.id), isNotNull(maintenanceTasks.templateKey)))
      .all();
    const byKey = new Map(existing.map((row) => [row.templateKey!, row]));

    for (const template of MAINTENANCE_TEMPLATES) {
      const row = byKey.get(template.templateKey);
      if (!row) {
        await db.insert(maintenanceTasks).values(templateToRow(bike.id, template)).run();
        inserted += 1;
        continue;
      }
      if (row.customized) continue;
      await db
        .update(maintenanceTasks)
        .set({
          ...templateOwnedFieldsFromTemplate(template),
          kind: template.kind,
          sortOrder: template.sortOrder,
        })
        .where(eq(maintenanceTasks.id, row.id))
        .run();
      updated += 1;
    }
  }

  return { inserted, updated };
}

export async function listMaintenanceTasksForBike(
  bikeId: string,
  userId: string,
): Promise<MaintenanceTaskView[]> {
  await requireBike(bikeId, userId);
  const rows = await db
    .select()
    .from(maintenanceTasks)
    .where(eq(maintenanceTasks.bikeId, bikeId))
    .orderBy(asc(maintenanceTasks.sortOrder), asc(maintenanceTasks.createdAt))
    .all();
  return enrichTasksForBike(bikeId, rows);
}

export async function listMaintenanceTasksForComponentCategory(
  bikeId: string,
  userId: string,
  category: string,
): Promise<MaintenanceTaskView[]> {
  const all = await listMaintenanceTasksForBike(bikeId, userId);
  return all.filter((task) => task.componentCategory === category && task.kind !== "touch_up");
}

export async function countMaintenanceAlerts(bikeId: string, userId: string): Promise<number> {
  const tasks = await listMaintenanceTasksForBike(bikeId, userId);
  return tasks.filter((task) => isAlertStatus(task.status)).length;
}

export async function countMaintenanceAlertsForCategory(
  bikeId: string,
  userId: string,
  category: string,
): Promise<number> {
  const tasks = await listMaintenanceTasksForComponentCategory(bikeId, userId, category);
  return tasks.filter((task) => task.enabled && isAlertStatus(task.status)).length;
}

export async function listServiceRecords(
  bikeId: string,
  userId: string,
  limit = 50,
): Promise<ServiceRecordView[]> {
  await requireBike(bikeId, userId);
  const rows = await db
    .select()
    .from(serviceRecords)
    .where(eq(serviceRecords.bikeId, bikeId))
    .orderBy(desc(serviceRecords.completedAt))
    .limit(limit)
    .all();
  return rows.map(toServiceRecordView);
}

async function requireMaintenanceTask(taskId: string, userId: string): Promise<MaintenanceTaskRow> {
  const row = await db
    .select()
    .from(maintenanceTasks)
    .innerJoin(bikes, eq(maintenanceTasks.bikeId, bikes.id))
    .where(and(eq(maintenanceTasks.id, taskId), eq(bikes.userId, userId)))
    .get();
  if (!row) throw notFound("Maintenance task");
  return row.maintenance_tasks;
}

export async function createMaintenanceTask(
  bikeId: string,
  userId: string,
  data: MaintenanceTaskInsert,
): Promise<MaintenanceTaskView> {
  await requireBike(bikeId, userId);
  const maxSort = await db
    .select({ sortOrder: maintenanceTasks.sortOrder })
    .from(maintenanceTasks)
    .where(eq(maintenanceTasks.bikeId, bikeId))
    .orderBy(desc(maintenanceTasks.sortOrder))
    .get();

  const row = await db
    .insert(maintenanceTasks)
    .values({
      bikeId,
      source: "custom",
      templateKey: null,
      kind: data.kind,
      title: data.title,
      description: data.description ?? null,
      componentCategory: data.componentCategory ?? null,
      triggerMode: data.triggerMode ?? (data.kind === "eol" ? "distance" : null),
      distanceMeters: data.distanceMeters ?? null,
      intervalDays: data.intervalDays ?? null,
      guideUrl: data.guideUrl ?? null,
      enabled: true,
      customized: false,
      sortOrder: data.sortOrder ?? (maxSort?.sortOrder ?? 0) + 1,
    })
    .returning()
    .get();

  return enrichSingleTask(row);
}

export async function updateMaintenanceTask(
  taskId: string,
  userId: string,
  data: MaintenanceTaskUpdate,
): Promise<MaintenanceTaskView> {
  const existing = await requireMaintenanceTask(taskId, userId);
  if (existing.source === "builtin") {
    assertBuiltinUpdateAllowed(existing, data);
  }
  const customized =
    existing.source === "builtin" &&
    (existing.customized || isBuiltinUserCustomization(existing, data));

  const row = await db
    .update(maintenanceTasks)
    .set({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.componentCategory !== undefined
        ? { componentCategory: data.componentCategory ?? null }
        : {}),
      ...(data.triggerMode !== undefined ? { triggerMode: data.triggerMode ?? null } : {}),
      ...(data.distanceMeters !== undefined ? { distanceMeters: data.distanceMeters ?? null } : {}),
      ...(data.intervalDays !== undefined ? { intervalDays: data.intervalDays ?? null } : {}),
      ...(data.guideUrl !== undefined ? { guideUrl: data.guideUrl ?? null } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(customized ? { customized: true } : {}),
    })
    .where(eq(maintenanceTasks.id, taskId))
    .returning()
    .get();

  return enrichSingleTask(row);
}

export async function toggleMaintenanceTask(
  taskId: string,
  userId: string,
  enabled: boolean,
): Promise<MaintenanceTaskView> {
  await requireMaintenanceTask(taskId, userId);
  const row = await db
    .update(maintenanceTasks)
    .set({ enabled })
    .where(eq(maintenanceTasks.id, taskId))
    .returning()
    .get();
  return enrichSingleTask(row);
}

export async function deleteMaintenanceTask(taskId: string, userId: string): Promise<void> {
  const existing = await requireMaintenanceTask(taskId, userId);
  if (existing.source === "builtin") {
    throw badRequest("Built-in maintenance tasks cannot be deleted", {
      code: "BUILTIN_TASK_NOT_DELETABLE",
    });
  }
  await db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, taskId)).run();
}

export async function resetMaintenanceTaskToDefault(
  taskId: string,
  userId: string,
): Promise<MaintenanceTaskView> {
  const existing = await requireMaintenanceTask(taskId, userId);
  if (existing.source !== "builtin" || !existing.templateKey) {
    throw badRequest("Only built-in tasks can be reset to default", {
      code: "TASK_NOT_RESETTABLE",
    });
  }
  const template = MAINTENANCE_TEMPLATE_BY_KEY.get(existing.templateKey);
  if (!template) throw badRequest("Template no longer exists");

  const row = await db
    .update(maintenanceTasks)
    .set({
      ...templateOwnedFieldsFromTemplate(template),
      kind: template.kind,
      sortOrder: template.sortOrder,
      customized: false,
      snoozedUntilDistanceMeters: null,
      snoozedUntilAt: null,
    })
    .where(eq(maintenanceTasks.id, taskId))
    .returning()
    .get();

  return enrichSingleTask(row);
}

function validateSnoozeInput(input: SnoozeMaintenanceInput): void {
  if (
    input.distanceMeters != null &&
    !(SNOOZE_DISTANCE_PRESETS_METERS as readonly number[]).includes(input.distanceMeters)
  ) {
    throw badRequest("Invalid distance snooze preset");
  }
  if (input.days != null && !(SNOOZE_TIME_PRESETS_DAYS as readonly number[]).includes(input.days)) {
    throw badRequest("Invalid time snooze preset");
  }
}

export async function snoozeMaintenanceTask(
  taskId: string,
  userId: string,
  input: SnoozeMaintenanceInput,
): Promise<MaintenanceTaskView> {
  validateSnoozeInput(input);
  const existing = await requireMaintenanceTask(taskId, userId);
  if (existing.kind === "touch_up") {
    throw badRequest("Touch-up tasks cannot be snoozed", { code: "INVALID_OPERATION_FOR_KIND" });
  }
  if (!existing.enabled) {
    throw badRequest("Task is disabled", { code: "TASK_DISABLED" });
  }

  const raw = await loadBikeMaintenanceRaw(existing.bikeId, [existing]);
  const ctx = buildDueContext(existing, raw);
  const updates: Partial<MaintenanceTaskRow> = {};

  if (input.distanceMeters != null) {
    const currentWear = ctx.wear?.distanceMeters ?? 0;
    updates.snoozedUntilDistanceMeters = currentWear + input.distanceMeters;
    updates.snoozedUntilAt = null;
  }
  if (input.days != null) {
    updates.snoozedUntilAt = Date.now() + input.days * 86_400_000;
    updates.snoozedUntilDistanceMeters = null;
  }

  const row = await db
    .update(maintenanceTasks)
    .set(updates)
    .where(eq(maintenanceTasks.id, taskId))
    .returning()
    .get();

  return enrichSingleTask(row);
}

async function createServiceRecordForTask(
  task: MaintenanceTaskRow,
  action: "serviced" | "replaced",
  input: { notes?: string | null; cost?: number | null },
): Promise<ServiceRecordView> {
  const raw = await loadBikeMaintenanceRaw(task.bikeId, [task]);
  const wear = resolveWearForCategory(task.componentCategory, raw);
  const active = task.componentCategory
    ? (raw.activeByCategory.get(task.componentCategory) ?? null)
    : null;

  const record = await db
    .insert(serviceRecords)
    .values({
      taskId: task.id,
      bikeId: task.bikeId,
      componentId: active?.id ?? null,
      action,
      notes: input.notes ?? null,
      cost: input.cost ?? null,
      wearDistanceMeters: wear?.distanceMeters ?? null,
      wearMovingTimeMinutes: wear?.movingTimeMinutes ?? null,
    })
    .returning()
    .get();

  await db
    .update(maintenanceTasks)
    .set({ snoozedUntilDistanceMeters: null, snoozedUntilAt: null })
    .where(eq(maintenanceTasks.id, task.id))
    .run();

  return toServiceRecordView(record);
}

export async function completeMaintenanceTask(
  taskId: string,
  userId: string,
  input: CompleteMaintenanceInput,
): Promise<ServiceRecordView> {
  const task = await requireMaintenanceTask(taskId, userId);
  if (task.kind === "touch_up") {
    throw badRequest("Use toggleTouchUpCheckItem for touch-up tasks", {
      code: "INVALID_OPERATION_FOR_KIND",
    });
  }
  if (!task.enabled) {
    throw badRequest("Task is disabled", { code: "TASK_DISABLED" });
  }
  return createServiceRecordForTask(task, "serviced", input);
}

export async function replaceComponentMaintenance(
  taskId: string,
  userId: string,
  input: ReplaceMaintenanceInput,
): Promise<ServiceRecordView> {
  const task = await requireMaintenanceTask(taskId, userId);
  if (task.kind !== "eol") {
    throw badRequest("Replace flow is for EOL tasks", { code: "INVALID_OPERATION_FOR_KIND" });
  }
  if (!task.enabled) {
    throw badRequest("Task is disabled", { code: "TASK_DISABLED" });
  }

  if (input.newComponentId) {
    const component = await requireComponent(input.newComponentId, userId);
    if (component.bikeId !== task.bikeId) {
      throw badRequest("Component must belong to this bike", { code: "COMPONENT_BIKE_MISMATCH" });
    }
    if (task.componentCategory && component.category !== task.componentCategory) {
      throw badRequest("Component must match the task category", {
        code: "COMPONENT_CATEGORY_MISMATCH",
      });
    }
    await activateComponent(input.newComponentId, userId);
    if (input.resetWear) {
      await updateComponent(
        input.newComponentId,
        userId,
        componentUpdateSchema.parse({
          distanceMeters: 0,
          movingTimeMinutes: 0,
        }),
      );
    }
  }

  return createServiceRecordForTask(task, "replaced", input);
}

export async function toggleTouchUpCheckItem(
  taskId: string,
  userId: string,
): Promise<MaintenanceTaskView> {
  const task = await requireMaintenanceTask(taskId, userId);
  if (task.kind !== "touch_up") {
    throw badRequest("Not a touch-up task", { code: "INVALID_OPERATION_FOR_KIND" });
  }

  const existing = await db
    .select()
    .from(maintenanceChecklistState)
    .where(eq(maintenanceChecklistState.taskId, taskId))
    .get();

  if (existing?.lastCheckedAt != null) {
    await db
      .delete(maintenanceChecklistState)
      .where(eq(maintenanceChecklistState.taskId, taskId))
      .run();
  } else {
    const now = Date.now();
    await db
      .insert(maintenanceChecklistState)
      .values({ taskId, lastCheckedAt: now })
      .onConflictDoUpdate({
        target: maintenanceChecklistState.taskId,
        set: { lastCheckedAt: now },
      })
      .run();
  }

  return enrichSingleTask(task);
}

export async function clearTouchUpChecklist(
  bikeId: string,
  userId: string,
): Promise<MaintenanceTaskView[]> {
  await requireBike(bikeId, userId);
  const touchUpTasks = await db
    .select()
    .from(maintenanceTasks)
    .where(and(eq(maintenanceTasks.bikeId, bikeId), eq(maintenanceTasks.kind, "touch_up")))
    .orderBy(asc(maintenanceTasks.sortOrder), asc(maintenanceTasks.createdAt))
    .all();

  if (touchUpTasks.length === 0) return [];

  const taskIds = touchUpTasks.map((task) => task.id);
  await db
    .delete(maintenanceChecklistState)
    .where(inArray(maintenanceChecklistState.taskId, taskIds))
    .run();

  return enrichTasksForBike(bikeId, touchUpTasks);
}

export async function countAlertsForBikes(
  userId: string,
  bikeIds: string[],
): Promise<Map<string, number>> {
  if (bikeIds.length === 0) return new Map();
  const counts = new Map<string, number>();
  await Promise.all(
    bikeIds.map(async (bikeId) => {
      counts.set(bikeId, await countMaintenanceAlerts(bikeId, userId));
    }),
  );
  return counts;
}

export async function alertCountsByCategoryForBike(
  bikeId: string,
  userId: string,
  categories: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (categories.length === 0) return result;
  const unique = [...new Set(categories)];
  await Promise.all(
    unique.map(async (category) => {
      result.set(category, await countMaintenanceAlertsForCategory(bikeId, userId, category));
    }),
  );
  return result;
}
