import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { child } from "../lib/logging/index.js";
import { db } from "./index.js";
import { runDrizzleMigrations } from "./run-migrations.js";

const log = child({ component: "db" });

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

async function hasTable(tableName: string): Promise<boolean> {
  const rows = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${tableName}`,
  );
  return rows.length > 0;
}

/** If a failed run added all component columns but never recorded the migration, mark it applied. */
async function recoverPartialComponentFieldsMigration(migrationsFolder: string): Promise<boolean> {
  if (!(await hasTable("__drizzle_migrations")) || !(await hasTable("components"))) {
    return false;
  }

  const applied = await db.all<{ name: string }>(
    sql`SELECT name FROM __drizzle_migrations WHERE name = ${COMPONENT_FIELDS_MIGRATION}`,
  );
  if (applied.length > 0) return false;

  // Prefer SELECT … LIMIT 0 over PRAGMA — Turso serverless PRAGMA probes are unreliable.
  for (const column of COMPONENT_FIELDS_COLUMNS) {
    try {
      await db.run(sql.raw(`SELECT "${column}" FROM "components" LIMIT 0`));
    } catch {
      return false;
    }
  }

  const migrationPath = join(migrationsFolder, COMPONENT_FIELDS_MIGRATION, "migration.sql");
  const query = readFileSync(migrationPath, "utf8");
  const hash = createHash("sha256").update(query).digest("hex");
  const createdAt = formatToMillis(COMPONENT_FIELDS_MIGRATION.slice(0, 14));

  await db.run(
    sql`INSERT INTO __drizzle_migrations ("hash", "created_at", "name", "applied_at") VALUES (${hash}, ${createdAt}, ${COMPONENT_FIELDS_MIGRATION}, ${new Date().toISOString()})`,
  );
  return true;
}

export async function applyMigrations(): Promise<void> {
  const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_FOLDER ?? "./drizzle";
  if (await recoverPartialComponentFieldsMigration(migrationsFolder)) {
    log.warn(
      { migration: COMPONENT_FIELDS_MIGRATION },
      "Recovered partial component-fields migration",
    );
  }
  await runDrizzleMigrations(db, migrationsFolder);
}
