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
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(nowMs),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(nowMs)
      .$onUpdateFn(nowMs),
  },
  (t) => [index("idx_bikes_name").on(t.name)],
);

export const componentSlots = sqliteTable(
  "component_slots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    bikeId: text("bike_id")
      .notNull()
      .references(() => bikes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(nowMs),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(nowMs)
      .$onUpdateFn(nowMs),
  },
  (t) => [index("idx_slots_bike").on(t.bikeId)],
);

export const componentOptions = sqliteTable(
  "component_options",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    slotId: text("slot_id")
      .notNull()
      .references(() => componentSlots.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    model: text("model"),
    notes: text("notes"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(nowMs),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(nowMs)
      .$onUpdateFn(nowMs),
  },
  (t) => [
    index("idx_options_slot").on(t.slotId),
    // Enforce "exactly one active option per slot": a unique partial index on
    // (slot_id) where is_active = 1 guarantees at most one active per slot.
    index("idx_options_active_per_slot")
      .on(t.slotId)
      .where(sql`${t.isActive} = 1`),
  ],
);

export type BikeRow = typeof bikes.$inferSelect;
export type ComponentSlotRow = typeof componentSlots.$inferSelect;
export type ComponentOptionRow = typeof componentOptions.$inferSelect;