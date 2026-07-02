import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index.js";

export function applyMigrations() {
  migrate(db, {
    migrationsFolder: process.env.DRIZZLE_MIGRATIONS_FOLDER ?? "./drizzle",
  });
}
