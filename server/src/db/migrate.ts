import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { db, sqlite } from "./index.js";

const COMPONENT_FIELDS_MIGRATION = "20260704053807_handy_sersi";

const COMPONENT_FIELDS_COLUMNS = [
  "distance_meters",
  "moving_time_minutes",
  "purchase_date",
  "purchase_cost",
  "purchase_store",
] as const;

function formatToMillis(dateStr: string): number {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);
  const hour = parseInt(dateStr.slice(8, 10), 10);
  const minute = parseInt(dateStr.slice(10, 12), 10);
  const second = parseInt(dateStr.slice(12, 14), 10);
  return Date.UTC(year, month, day, hour, minute, second);
}

/** If a failed run added all component columns but never recorded the migration, mark it applied. */
function recoverPartialComponentFieldsMigration(migrationsFolder: string) {
  const applied = sqlite
    .prepare("SELECT name FROM __drizzle_migrations WHERE name = ?")
    .get(COMPONENT_FIELDS_MIGRATION) as { name: string } | undefined;
  if (applied) return;

  const columnNames = new Set(
    (sqlite.prepare("PRAGMA table_info(components)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  const hasAllColumns = COMPONENT_FIELDS_COLUMNS.every((name) => columnNames.has(name));
  if (!hasAllColumns) return;

  const migrationPath = join(migrationsFolder, COMPONENT_FIELDS_MIGRATION, "migration.sql");
  const query = readFileSync(migrationPath, "utf8");
  const hash = createHash("sha256").update(query).digest("hex");
  const createdAt = formatToMillis(COMPONENT_FIELDS_MIGRATION.slice(0, 14));

  sqlite
    .prepare(
      'INSERT INTO __drizzle_migrations ("hash", "created_at", "name", "applied_at") VALUES (?, ?, ?, ?)',
    )
    .run(hash, createdAt, COMPONENT_FIELDS_MIGRATION, new Date().toISOString());
}

export function applyMigrations() {
  const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_FOLDER ?? "./drizzle";
  recoverPartialComponentFieldsMigration(migrationsFolder);
  migrate(db, { migrationsFolder });
}
