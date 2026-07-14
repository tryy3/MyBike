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
 * See server/src/db/run-migrations.ts — Turso Cloud / serverless-safe migrator
 * with name backfill, hash matching, and schema baselining.
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

  if (dbMigrationRows.length === 0 && (await schemaLooksMigrated(db))) {
    await recordMigrationsApplied(db, migrationsTable, migrations);
    return;
  }

  const migrationsToRun = resolveMigrationsToRun(migrations, dbMigrationRows);
  if (migrationsToRun.length === 0) return;

  await db.transaction(async (tx) => {
    for (const migration of migrationsToRun) {
      for (const stmt of migration.sql) {
        await tx.run(sql.raw(stmt));
      }
      await tx.run(
        sql`INSERT INTO ${table} ("hash", "created_at", "name", "applied_at") VALUES (${migration.hash}, ${migration.folderMillis}, ${migration.name ?? null}, ${new Date().toISOString()})`,
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

async function schemaLooksMigrated(db: AppDb): Promise<boolean> {
  const rows = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${"webhook_events"}`,
  );
  return rows.length > 0;
}

async function recordMigrationsApplied(
  db: AppDb,
  migrationsTable: string,
  migrations: LocalMigration[],
): Promise<void> {
  const table = sql.identifier(migrationsTable);
  const appliedAt = new Date().toISOString();
  await db.transaction(async (tx) => {
    for (const migration of migrations) {
      await tx.run(
        sql`INSERT INTO ${table} ("hash", "created_at", "name", "applied_at") VALUES (${migration.hash}, ${migration.folderMillis}, ${migration.name ?? null}, ${appliedAt})`,
      );
    }
  });
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
