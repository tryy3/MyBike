import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { db } from "./index.js";

export function applyMigrations() {
  const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_FOLDER ?? "./drizzle";
  migrate(db, { migrationsFolder });
}
