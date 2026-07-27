import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { ComponentPropertiesRead } from "shared";
import { user } from "./auth-schema.js";

function uuid() {
  return crypto.randomUUID();
}

function nowMs() {
  return Date.now();
}

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const permissions = sqliteTable("permissions", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    uniqueIndex("idx_user_roles_user").on(t.userId),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  isSecret: integer("is_secret", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull().$defaultFn(nowMs),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

export const configAuditLog = sqliteTable(
  "config_audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    key: text("key").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: integer("created_at").notNull().$defaultFn(nowMs),
  },
  (t) => [index("idx_config_audit_log_created_at").on(t.createdAt)],
);

export const appRuntimeState = sqliteTable("app_runtime_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const bikes = sqliteTable(
  "bikes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    model: text("model"),
    year: integer("year"),
    notes: text("notes"),
    stravaGearId: text("strava_gear_id"),
    createdAt: integer("created_at").notNull().$defaultFn(nowMs),
    updatedAt: integer("updated_at").notNull().$defaultFn(nowMs).$onUpdateFn(nowMs),
  },
  (t) => [
    index("idx_bikes_name").on(t.name),
    index("idx_bikes_user").on(t.userId),
    uniqueIndex("idx_bikes_user_strava_gear")
      .on(t.userId, t.stravaGearId)
      .where(sql`${t.stravaGearId} IS NOT NULL`),
  ],
);

export const components = sqliteTable(
  "components",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    bikeId: text("bike_id")
      .notNull()
      .references(() => bikes.id, { onDelete: "cascade" }),
    // category is a stable id from the hardcoded CATEGORIES list in shared/.
    category: text("category").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    model: text("model"),
    notes: text("notes"),
    /** Category-specific bag (e.g. chain lubeType). NULL means empty `{}` at the API. */
    properties: text("properties", { mode: "json" }).$type<ComponentPropertiesRead | null>(),
    distanceMeters: integer("distance_meters"),
    movingTimeMinutes: integer("moving_time_minutes"),
    purchaseDate: text("purchase_date"),
    purchaseCost: real("purchase_cost"),
    purchaseStore: text("purchase_store"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
    // Soft retirement: inactive components can be archived to leave the
    // active/alternate rotation without deleting history.
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    // Manual ordering within a (bike, category). New components are appended at
    // max+1 so the default order matches creation order; the user can reorder
    // via drag-and-drop, which rewrites these values.
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(nowMs),
    updatedAt: integer("updated_at").notNull().$defaultFn(nowMs).$onUpdateFn(nowMs),
  },
  (t) => [
    index("idx_components_bike").on(t.bikeId),
    // Ordered reads within a (bike, category).
    index("idx_components_category_order").on(t.bikeId, t.category, t.sortOrder),
    // Enforce "at most one active component per (bike, category)": a unique
    // partial index guarantees a category never has more than one active part.
    uniqueIndex("idx_components_active_per_category")
      .on(t.bikeId, t.category)
      .where(sql`${t.isActive} = 1`),
  ],
);

export const stravaSyncState = sqliteTable("strava_sync_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastSyncedAt: integer("last_synced_at").notNull(),
  updatedAt: integer("updated_at").notNull().$defaultFn(nowMs).$onUpdateFn(nowMs),
});

export const stravaWebhookCursor = sqliteTable("strava_webhook_cursor", {
  id: integer("id").primaryKey(),
  lastProxyEventId: integer("last_proxy_event_id").notNull().default(0),
  updatedAt: integer("updated_at").notNull().$defaultFn(nowMs).$onUpdateFn(nowMs),
});

export const stravaBikes = sqliteTable(
  "strava_bikes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stravaGearId: text("strava_gear_id").notNull(),
    bikeId: text("bike_id")
      .notNull()
      .references(() => bikes.id, { onDelete: "cascade" }),
    linkedAt: integer("linked_at").notNull().$defaultFn(nowMs),
    // Activities with start_date before this day (YYYY-MM-DD) are stored but not
    // linked to components unless the user opted into historical component credit.
    componentCreditFrom: text("component_credit_from").notNull(),
  },
  (t) => [
    uniqueIndex("idx_strava_bikes_user_gear").on(t.userId, t.stravaGearId),
    uniqueIndex("idx_strava_bikes_user_bike").on(t.userId, t.bikeId),
    index("idx_strava_bikes_bike").on(t.bikeId),
  ],
);

export const stravaActivities = sqliteTable(
  "strava_activities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bikeId: text("bike_id")
      .notNull()
      .references(() => bikes.id, { onDelete: "cascade" }),
    stravaActivityId: text("strava_activity_id").notNull(),
    stravaGearId: text("strava_gear_id").notNull(),
    distanceMeters: integer("distance_meters").notNull(),
    movingTimeMinutes: integer("moving_time_minutes").notNull(),
    startDate: text("start_date").notNull(),
    processedAt: integer("processed_at").notNull().$defaultFn(nowMs),
    editedAt: integer("edited_at"),
  },
  (t) => [
    index("idx_strava_activities_user").on(t.userId),
    index("idx_strava_activities_bike").on(t.bikeId),
    uniqueIndex("idx_strava_activities_user_activity").on(t.userId, t.stravaActivityId),
  ],
);

export const stravaActivityComponents = sqliteTable(
  "strava_activity_components",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    activityId: text("activity_id")
      .notNull()
      .references(() => stravaActivities.id, { onDelete: "cascade" }),
    componentId: text("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "cascade" }),
    distanceMeters: integer("distance_meters").notNull(),
    movingTimeMinutes: integer("moving_time_minutes").notNull(),
  },
  (t) => [
    index("idx_strava_activity_components_activity").on(t.activityId),
    index("idx_strava_activity_components_component").on(t.componentId),
    uniqueIndex("idx_strava_activity_components_unique").on(t.activityId, t.componentId),
  ],
);

export type StravaSyncStateRow = typeof stravaSyncState.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type PermissionRow = typeof permissions.$inferSelect;
export type RolePermissionRow = typeof rolePermissions.$inferSelect;
export type UserRoleRow = typeof userRoles.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;
export type ConfigAuditLogRow = typeof configAuditLog.$inferSelect;
export type AppRuntimeStateRow = typeof appRuntimeState.$inferSelect;
export type BikeRow = typeof bikes.$inferSelect;
export type ComponentRow = typeof components.$inferSelect;
export type StravaBikeRow = typeof stravaBikes.$inferSelect;
export type StravaActivityRow = typeof stravaActivities.$inferSelect;

export const maintenanceTasks = sqliteTable(
  "maintenance_tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    bikeId: text("bike_id")
      .notNull()
      .references(() => bikes.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    templateKey: text("template_key"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    componentCategory: text("component_category"),
    triggerMode: text("trigger_mode"),
    distanceMeters: integer("distance_meters"),
    intervalDays: integer("interval_days"),
    guideUrl: text("guide_url"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    customized: integer("customized", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    snoozedUntilDistanceMeters: integer("snoozed_until_distance_meters"),
    snoozedUntilAt: integer("snoozed_until_at"),
    createdAt: integer("created_at").notNull().$defaultFn(nowMs),
    updatedAt: integer("updated_at").notNull().$defaultFn(nowMs).$onUpdateFn(nowMs),
  },
  (t) => [
    index("idx_maintenance_tasks_bike").on(t.bikeId),
    uniqueIndex("idx_maintenance_tasks_bike_template")
      .on(t.bikeId, t.templateKey)
      .where(sql`${t.templateKey} IS NOT NULL`),
  ],
);

export const serviceRecords = sqliteTable(
  "service_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    taskId: text("task_id")
      .notNull()
      .references(() => maintenanceTasks.id, { onDelete: "cascade" }),
    bikeId: text("bike_id")
      .notNull()
      .references(() => bikes.id, { onDelete: "cascade" }),
    componentId: text("component_id").references(() => components.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    completedAt: integer("completed_at").notNull().$defaultFn(nowMs),
    notes: text("notes"),
    cost: real("cost"),
    wearDistanceMeters: integer("wear_distance_meters"),
    wearMovingTimeMinutes: integer("wear_moving_time_minutes"),
    createdAt: integer("created_at").notNull().$defaultFn(nowMs),
  },
  (t) => [
    index("idx_service_records_bike_completed").on(t.bikeId, t.completedAt),
    index("idx_service_records_task_completed").on(t.taskId, t.completedAt),
  ],
);

export const maintenanceChecklistState = sqliteTable("maintenance_checklist_state", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => maintenanceTasks.id, { onDelete: "cascade" }),
  lastCheckedAt: integer("last_checked_at"),
});

export type MaintenanceTaskRow = typeof maintenanceTasks.$inferSelect;
export type ServiceRecordRow = typeof serviceRecords.$inferSelect;
export type MaintenanceChecklistStateRow = typeof maintenanceChecklistState.$inferSelect;
