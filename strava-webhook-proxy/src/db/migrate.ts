import { db } from "./index.js";
import { runDrizzleMigrations } from "./run-migrations.js";

export async function applyMigrations(): Promise<void> {
  const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_FOLDER ?? "./drizzle";
  await runDrizzleMigrations(db, migrationsFolder);
}
