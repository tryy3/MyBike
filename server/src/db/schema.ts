import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.js";

function uuid() {
  return crypto.randomUUID();
}

function nowMs() {
  return Date.now();
}

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
    distanceMeters: integer("distance_meters"),
    movingTimeMinutes: integer("moving_time_minutes"),
    purchaseDate: text("purchase_date"),
    purchaseCost: real("purchase_cost"),
    purchaseStore: text("purchase_store"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
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

export type BikeRow = typeof bikes.$inferSelect;
export type ComponentRow = typeof components.$inferSelect;
export type StravaBikeRow = typeof stravaBikes.$inferSelect;
export type StravaActivityRow = typeof stravaActivities.$inferSelect;
