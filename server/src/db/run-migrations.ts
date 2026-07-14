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
 * This runner detects columns via `SELECT col FROM table LIMIT 0` (works over
 * serverless HTTP) and treats duplicate-column ALTER errors as already upgraded
 * so local Turso Database and remote Cloud behave the same.
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

export async function ensureMigrationsTableV1(db: AppDb, migrationsTable: string): Promise<void> {
  await addColumnIfMissing(db, migrationsTable, "name", "text");
  await addColumnIfMissing(db, migrationsTable, "applied_at", "TEXT");
}

export function isDuplicateColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate column name/i.test(msg);
}

export function isNoSuchColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such column/i.test(msg);
}

async function addColumnIfMissing(
  db: AppDb,
  migrationsTable: string,
  column: string,
  typeSql: string,
): Promise<void> {
  const safeTable = quoteIdent(migrationsTable);
  const safeCol = quoteIdent(column);

  // SELECT works over Turso serverless; PRAGMA / pragma_table_info often does not.
  try {
    await db.run(sql.raw(`SELECT ${safeCol} FROM ${safeTable} LIMIT 0`));
    return;
  } catch (err) {
    if (!isNoSuchColumnError(err)) {
      // Inconclusive (driver quirk): fall through and try ADD COLUMN.
    }
  }

  try {
    await db.run(sql.raw(`ALTER TABLE ${safeTable} ADD COLUMN ${safeCol} ${typeSql}`));
  } catch (err) {
    if (isDuplicateColumnError(err)) return;
    throw err;
  }
}

function quoteIdent(ident: string): string {
  return `"${ident.replaceAll('"', '""')}"`;
}
