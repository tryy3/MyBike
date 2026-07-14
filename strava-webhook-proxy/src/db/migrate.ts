import { migrate as migrateLocal } from "drizzle-orm/tursodatabase/migrator";
import { migrate as migrateRemote } from "drizzle-orm/libsql/migrator";
import { db, dbMode } from "./index.js";

export async function applyMigrations(): Promise<void> {
  const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_FOLDER ?? "./drizzle";
  if (dbMode === "remote") {
    await migrateRemote(db as never, { migrationsFolder });
  } else {
    await migrateLocal(db, { migrationsFolder });
  }
}
