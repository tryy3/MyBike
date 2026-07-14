import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { getMigrationsToRun } from "drizzle-orm/migrator.utils";
import type { AppDb } from "./index.js";

const DEFAULT_MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * Drizzle's built-in `upgradeAsyncIfNeeded` probes columns with
 * `pragma_table_info(?)` (bound parameter). That returns no rows on Turso
 * Cloud / serverless, so an already-v1 `__drizzle_migrations` table is treated
 * as v0 and `ADD COLUMN name` fails with "duplicate column name".
 *
 * This runner uses a literal PRAGMA table name and applies pending migrations
 * itself so local Turso Database and remote serverless behave the same.
 */
export async function runDrizzleMigrations(
  db: AppDb,
  migrationsFolder: string,
  migrationsTable = DEFAULT_MIGRATIONS_TABLE,
): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder, migrationsTable });
  const table = sql.identifier(migrationsTable);

  const existing = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`,
  );

  if (existing.length === 0) {
    await db.run(sql`
      CREATE TABLE ${table} (
        id INTEGER PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric,
        name text,
        applied_at TEXT
      )
    `);
  } else {
    await ensureMigrationsTableV1(db, migrationsTable);
  }

  const dbMigrationRows = await db.all<{
    id: number;
    hash: string;
    created_at: number | string;
    name: string | null;
  }>(sql`SELECT id, hash, created_at, name FROM ${table}`);

  const dbMigrations = dbMigrationRows.map((row) => ({
    ...row,
    created_at: String(row.created_at),
  }));

  const migrationsToRun = getMigrationsToRun({
    localMigrations: migrations,
    dbMigrations,
  });

  if (migrationsToRun.length === 0) return;

  await db.transaction(async (tx) => {
    for (const migration of migrationsToRun) {
      for (const stmt of migration.sql) {
        await tx.run(sql.raw(stmt));
      }
      await tx.run(
        sql`INSERT INTO ${table} ("hash", "created_at", "name", "applied_at") VALUES (${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${new Date().toISOString()})`,
      );
    }
  });
}

async function ensureMigrationsTableV1(db: AppDb, migrationsTable: string): Promise<void> {
  // Literal table name — do not bind as a parameter (breaks on Turso serverless).
  const columns = await db.all<{ name: string }>(
    sql.raw(`SELECT name FROM pragma_table_info('${migrationsTable.replaceAll("'", "''")}')`),
  );
  const names = new Set(columns.map((c) => c.name));
  if (names.has("name") && names.has("applied_at")) return;

  const table = sql.identifier(migrationsTable);
  if (!names.has("name")) {
    await db.run(sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier("name")} text`);
  }
  if (!names.has("applied_at")) {
    await db.run(sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier("applied_at")} TEXT`);
  }
}
