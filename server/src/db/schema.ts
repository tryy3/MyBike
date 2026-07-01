import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
    name: text("name").notNull(),
    brand: text("brand"),
    model: text("model"),
    year: integer("year"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().$defaultFn(nowMs),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(nowMs)
      .$onUpdateFn(nowMs),
  },
  (t) => [index("idx_bikes_name").on(t.name)],
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
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(false),
    // Manual ordering within a (bike, category). New components are appended at
    // max+1 so the default order matches creation order; the user can reorder
    // via drag-and-drop, which rewrites these values.
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(nowMs),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(nowMs)
      .$onUpdateFn(nowMs),
  },
  (t) => [
    index("idx_components_bike").on(t.bikeId),
    // Ordered reads within a (bike, category).
    index("idx_components_category_order").on(
      t.bikeId,
      t.category,
      t.sortOrder,
    ),
    // Enforce "at most one active component per (bike, category)": a unique
    // partial index guarantees a category never has more than one active part.
    index("idx_components_active_per_category")
      .on(t.bikeId, t.category)
      .where(sql`${t.isActive} = 1`),
  ],
);

export type BikeRow = typeof bikes.$inferSelect;
export type ComponentRow = typeof components.$inferSelect;
