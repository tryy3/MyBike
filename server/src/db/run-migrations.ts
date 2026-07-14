import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { AppDb } from "./index.js";

const DEFAULT_MIGRATIONS_TABLE = "__drizzle_migrations";

type LocalMigration = {
  sql: string[];
  hash: string;
  folderMillis: number;
  name: string | undefined;
};

type DbMigrationRow = {
  id: number;
  hash: string;
  created_at: number | string;
  name: string | null;
};

/**
 * Drizzle's built-in migrator breaks on Turso Cloud / serverless:
 * - `pragma_table_info(?)` column probes miss columns that already exist
 * - v1 matching is name-only; imported DBs often have hash/created_at rows
 *   with NULL `name`, so every migration looks pending and CREATE TABLE fails
 *
 * This runner upgrades columns idempotently, backfills names from hash/millis,
 * matches applied migrations by name or hash, applies pending SQL with benign
 * "already exists" tolerance (needed after Cloud imports), and repairs journal
 * rows whose CREATE TABLE objects are still missing.
 */
export async function runDrizzleMigrations(
  db: AppDb,
  migrationsFolder: string,
  migrationsTable = DEFAULT_MIGRATIONS_TABLE,
): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder, migrationsTable }) as LocalMigration[];
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

  let dbMigrationRows = await readDbMigrations(db, migrationsTable);
  await backfillMigrationNames(db, migrationsTable, migrations, dbMigrationRows);
  dbMigrationRows = await readDbMigrations(db, migrationsTable);

  // Fix false "applied" markers (e.g. empty-journal baselining) when tables are missing.
  await repairIncompleteAppliedMigrations(db, migrations, dbMigrationRows);

  dbMigrationRows = await readDbMigrations(db, migrationsTable);
  const migrationsToRun = resolveMigrationsToRun(migrations, dbMigrationRows);
  if (migrationsToRun.length === 0) return;

  // Per-statement commits: SQLite aborts a transaction after the first error, so
  // we cannot swallow "already exists" inside one multi-migration transaction.
  for (const migration of migrationsToRun) {
    await applyMigrationSql(db, migration.sql);
    await db.run(
      sql`INSERT INTO ${table} ("hash", "created_at", "name", "applied_at") VALUES (${migration.hash}, ${migration.folderMillis}, ${migration.name ?? null}, ${new Date().toISOString()})`,
    );
  }
}

export async function ensureMigrationsTableV1(db: AppDb, migrationsTable: string): Promise<void> {
  await addColumnIfMissing(db, migrationsTable, "name", "text");
  await addColumnIfMissing(db, migrationsTable, "applied_at", "TEXT");
}

export function isDuplicateColumnError(err: unknown): boolean {
  return /duplicate column name/i.test(errorMessageChain(err));
}

export function isNoSuchColumnError(err: unknown): boolean {
  return /no such column/i.test(errorMessageChain(err));
}

/** Schema objects that already exist after a Cloud import / partial apply. */
export function isBenignSchemaError(err: unknown): boolean {
  const msg = errorMessageChain(err);
  return /already exists/i.test(msg) || /duplicate column name/i.test(msg);
}

/** Drizzle wraps driver errors; match against the full cause chain. */
export function errorMessageChain(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
      continue;
    }
    if ("message" in current && typeof (current as { message: unknown }).message === "string") {
      parts.push((current as { message: string }).message);
    }
    break;
  }
  return parts.length > 0 ? parts.join("\n") : String(err);
}

/** Prefer name matches; fall back to hash so NULL-name journal rows still count. */
export function resolveMigrationsToRun(
  localMigrations: LocalMigration[],
  dbMigrations: DbMigrationRow[],
): LocalMigration[] {
  const appliedNames = new Set<string>();
  const appliedHashes = new Set<string>();

  for (const row of dbMigrations) {
    if (row.hash) appliedHashes.add(row.hash);
    if (row.name) {
      appliedNames.add(row.name);
      continue;
    }
    const matched = matchLocalMigration(row, localMigrations);
    if (matched?.name) appliedNames.add(matched.name);
  }

  return localMigrations.filter((lm) => {
    if (lm.name && appliedNames.has(lm.name)) return false;
    if (lm.hash && appliedHashes.has(lm.hash)) return false;
    return true;
  });
}

export function matchLocalMigration(
  dbRow: Pick<DbMigrationRow, "hash" | "created_at">,
  localMigrations: LocalMigration[],
): LocalMigration | undefined {
  const sorted = [...localMigrations].sort((a, b) =>
    a.folderMillis !== b.folderMillis
      ? a.folderMillis - b.folderMillis
      : (a.name ?? "").localeCompare(b.name ?? ""),
  );

  const byMillis = new Map<number, LocalMigration[]>();
  const byHash = new Map<string, LocalMigration>();
  for (const lm of sorted) {
    const group = byMillis.get(lm.folderMillis) ?? [];
    group.push(lm);
    byMillis.set(lm.folderMillis, group);
    byHash.set(lm.hash, lm);
  }

  const stringified = String(dbRow.created_at);
  const millis = Number(stringified.substring(0, stringified.length - 3) + "000");
  const candidates = byMillis.get(millis);

  if (candidates?.length === 1) return candidates[0];
  if (candidates && candidates.length > 1) {
    return candidates.find((c) => c.hash === dbRow.hash) ?? byHash.get(dbRow.hash);
  }
  return byHash.get(dbRow.hash);
}

export function extractCreatedTableNames(statements: string[]): string[] {
  const names: string[] = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z_][\w]*)[`"]?/gi;
  for (const stmt of statements) {
    for (const match of stmt.matchAll(re)) {
      const name = match[1];
      if (name) names.push(name);
    }
  }
  return names;
}

async function readDbMigrations(db: AppDb, migrationsTable: string): Promise<DbMigrationRow[]> {
  const safeTable = quoteIdent(migrationsTable);
  const rows = await db.all<{
    id: number;
    hash: string;
    created_at: number | string;
    migration_name: string | null;
  }>(
    sql.raw(
      `SELECT id, hash, created_at, name AS migration_name FROM ${safeTable} ORDER BY id ASC`,
    ),
  );

  return rows.map((row) => ({
    id: row.id,
    hash: row.hash,
    created_at: row.created_at,
    name: row.migration_name,
  }));
}

async function backfillMigrationNames(
  db: AppDb,
  migrationsTable: string,
  localMigrations: LocalMigration[],
  dbRows: DbMigrationRow[],
): Promise<void> {
  const table = sql.identifier(migrationsTable);
  for (const row of dbRows) {
    if (row.name) continue;
    const matched = matchLocalMigration(row, localMigrations);
    if (!matched?.name) continue;
    await db.run(
      sql`UPDATE ${table} SET ${sql.identifier("name")} = ${matched.name} WHERE ${sql.identifier("id")} = ${row.id}`,
    );
  }
}

async function repairIncompleteAppliedMigrations(
  db: AppDb,
  localMigrations: LocalMigration[],
  dbRows: DbMigrationRow[],
): Promise<void> {
  const pending = new Set(resolveMigrationsToRun(localMigrations, dbRows).map((m) => m.hash));

  for (const migration of localMigrations) {
    if (pending.has(migration.hash)) continue;

    const createdTables = extractCreatedTableNames(migration.sql);
    if (createdTables.length === 0) continue;

    let missing = false;
    for (const tableName of createdTables) {
      if (!(await hasTable(db, tableName))) {
        missing = true;
        break;
      }
    }
    if (!missing) continue;

    await applyMigrationSql(db, migration.sql);
  }
}

async function applyMigrationSql(db: AppDb, statements: string[]): Promise<void> {
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    try {
      await db.run(sql.raw(trimmed));
    } catch (err) {
      if (isBenignSchemaError(err)) continue;
      throw err;
    }
  }
}

async function hasTable(db: AppDb, tableName: string): Promise<boolean> {
  const rows = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${tableName}`,
  );
  return rows.length > 0;
}

async function addColumnIfMissing(
  db: AppDb,
  migrationsTable: string,
  column: string,
  typeSql: string,
): Promise<void> {
  const safeTable = quoteIdent(migrationsTable);
  const safeCol = quoteIdent(column);

  try {
    await db.run(sql.raw(`SELECT ${safeCol} FROM ${safeTable} LIMIT 0`));
    return;
  } catch (err) {
    if (!isNoSuchColumnError(err)) {
      // Inconclusive — fall through and try ADD COLUMN.
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
