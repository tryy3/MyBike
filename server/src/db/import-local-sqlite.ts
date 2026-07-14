import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { child } from "../lib/logging/index.js";
import { db, dbMode, type AppDb } from "./index.js";

const log = child({ component: "db" });

const META_TABLE = "__mybike_meta";
const IMPORT_MARKER_KEY = "local_sqlite_import_v1";

/** FK-safe order; excludes __drizzle_migrations and meta table. */
const COPY_TABLES = [
  "user",
  "account",
  "session",
  "verification",
  "apikey",
  "bikes",
  "components",
  "strava_sync_state",
  "strava_bikes",
  "strava_activities",
  "strava_activity_components",
  "strava_webhook_cursor",
] as const;

type LocalDb = AppDb & { $client: { close: () => Promise<void> } };

export function importDoneMarkerPath(localPath: string): string {
  return `${localPath}.imported`;
}

export function importLockPath(localPath: string): string {
  return `${localPath}.importing`;
}

export function readFileImportMarker(localPath: string): string | null {
  const markerPath = importDoneMarkerPath(localPath);
  if (!existsSync(markerPath)) return null;
  try {
    const value = readFileSync(markerPath, "utf8").trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeFileImportMarker(localPath: string, value: string): void {
  writeFileSync(importDoneMarkerPath(localPath), `${value}\n`, "utf8");
}

function writeImportLock(localPath: string): void {
  writeFileSync(importLockPath(localPath), `${new Date().toISOString()}\n`, "utf8");
}

function removeImportLock(localPath: string): void {
  try {
    if (existsSync(importLockPath(localPath))) unlinkSync(importLockPath(localPath));
  } catch {
    // Best-effort cleanup.
  }
}

async function openLocalDb(dbPath: string): Promise<LocalDb> {
  const { connect } = await import("@tursodatabase/database");
  const { drizzle } = await import("drizzle-orm/tursodatabase/database");
  const client = await connect(dbPath);
  return drizzle({ client }) as LocalDb;
}

async function ensureMetaTable(): Promise<void> {
  await db.run(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(META_TABLE)} (
      key text PRIMARY KEY NOT NULL,
      value text NOT NULL,
      updated_at text NOT NULL
    )
  `),
  );
}

async function getImportMarker(): Promise<string | null> {
  await ensureMetaTable();
  const rows = await db.all<{ value: string }>(
    sql`SELECT value FROM ${sql.identifier(META_TABLE)} WHERE key = ${IMPORT_MARKER_KEY}`,
  );
  return rows[0]?.value ?? null;
}

async function setImportMarker(value: string): Promise<void> {
  await ensureMetaTable();
  const now = new Date().toISOString();
  await db.run(
    sql`INSERT OR REPLACE INTO ${sql.identifier(META_TABLE)} (key, value, updated_at) VALUES (${IMPORT_MARKER_KEY}, ${value}, ${now})`,
  );
}

async function markImportDone(localPath: string, value: string): Promise<void> {
  writeFileImportMarker(localPath, value);
  try {
    await setImportMarker(value);
  } catch (err) {
    log.warn(
      { err, value, markerFile: importDoneMarkerPath(localPath) },
      "Could not persist SQLite import marker to remote DB; file marker is set",
    );
  }
}

async function safeCountRows(target: AppDb, table: string): Promise<number> {
  if (!(await tableExists(target, table))) return 0;
  const rows = await target.all<{ count: number }>(
    sql.raw(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`),
  );
  return rows[0]?.count ?? 0;
}

async function tableExists(target: AppDb, table: string): Promise<boolean> {
  const rows = await target.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${table}`,
  );
  return rows.length > 0;
}

async function copyTable(local: AppDb, table: string): Promise<number> {
  if (!(await tableExists(local, table))) return 0;

  const columns = await local.all<{ name: string }>(
    sql.raw(`SELECT name FROM pragma_table_info(${sqlStringLiteral(table)}) ORDER BY cid`),
  );
  if (columns.length === 0) return 0;

  const colList = columns.map((c) => quoteIdent(c.name)).join(", ");
  const rows = await local.all<Record<string, unknown>>(
    sql.raw(`SELECT ${colList} FROM ${quoteIdent(table)}`),
  );
  if (rows.length === 0) return 0;

  let copied = 0;
  for (const row of rows) {
    const values = columns.map((c) => row[c.name]);
    const placeholders = sql.join(
      values.map((value) => sql`${value}`),
      sql`, `,
    );
    await db.run(
      sql`INSERT OR REPLACE INTO ${sql.raw(quoteIdent(table))} (${sql.raw(colList)}) VALUES (${placeholders})`,
    );
    copied++;
  }
  return copied;
}

function quoteIdent(ident: string): string {
  return `"${ident.replaceAll('"', '""')}"`;
}

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * One-time copy of domain data from a local SQLite/Turso file into Turso Cloud.
 * Runs only in remote mode when a local file exists and no import marker is set.
 *
 * Completion is recorded in a file next to the local DB (reliable on Docker volumes)
 * and in remote `__mybike_meta` when Turso accepts the write.
 */
export async function importLocalSqliteIfNeeded(): Promise<void> {
  if (dbMode !== "remote") return;

  const localPath =
    process.env.SQLITE_IMPORT_PATH?.trim() || process.env.DB_PATH?.trim() || "./data/mybike.db";
  if (!existsSync(localPath)) {
    return;
  }

  const fileMarker = readFileImportMarker(localPath);
  if (fileMarker) {
    log.info(
      { localPath, marker: fileMarker, markerFile: importDoneMarkerPath(localPath) },
      "Skipping SQLite import: completion marker file exists",
    );
    return;
  }

  let dbMarker: string | null = null;
  try {
    dbMarker = await getImportMarker();
  } catch (err) {
    log.warn(
      { err, localPath },
      "Could not read SQLite import marker from remote DB; using file/count checks only",
    );
  }

  if (dbMarker) {
    writeFileImportMarker(localPath, dbMarker);
    log.info(
      { localPath, marker: dbMarker },
      "Skipping SQLite import: remote marker exists (synced to file)",
    );
    return;
  }

  const local = await openLocalDb(localPath);
  try {
    const localBikes = await safeCountRows(local, "bikes");
    const localActivities = await safeCountRows(local, "strava_activities");
    const remoteBikes = await safeCountRows(db, "bikes");
    const remoteActivities = await safeCountRows(db, "strava_activities");

    const localHasDomainData = localBikes > 0 || localActivities > 0;
    const remoteHasDomainData = remoteBikes > 0 || remoteActivities > 0;

    if (!localHasDomainData) {
      await markImportDone(localPath, "skipped-empty-local");
      log.info({ localPath }, "Skipping SQLite import: local file has no bike/activity data");
      return;
    }

    if (remoteHasDomainData && remoteBikes >= localBikes && remoteActivities >= localActivities) {
      await markImportDone(localPath, "skipped-remote-has-data");
      log.info(
        { localPath, localBikes, localActivities, remoteBikes, remoteActivities },
        "Skipping SQLite import: remote already has domain data",
      );
      return;
    }

    if (existsSync(importLockPath(localPath))) {
      log.warn(
        { localPath, lockFile: importLockPath(localPath) },
        "Resuming SQLite import after interrupted run",
      );
    }

    log.info(
      { localPath, localBikes, localActivities, remoteBikes, remoteActivities },
      "Starting one-time SQLite to Turso import",
    );

    writeImportLock(localPath);
    let totalRows = 0;
    try {
      for (const table of COPY_TABLES) {
        const copied = await copyTable(local, table);
        if (copied > 0) {
          log.info({ table, copied }, "Imported table rows from local SQLite");
          totalRows += copied;
        }
      }

      const afterBikes = await safeCountRows(db, "bikes");
      const afterActivities = await safeCountRows(db, "strava_activities");
      if (afterBikes === 0 && afterActivities === 0 && totalRows > 0) {
        log.error(
          { localPath, totalRows, afterBikes, afterActivities },
          "SQLite import reported copied rows but remote counts are still zero",
        );
      }

      await markImportDone(localPath, "completed");
      log.info(
        {
          localPath,
          totalRows,
          afterBikes,
          afterActivities,
          markerFile: importDoneMarkerPath(localPath),
        },
        "One-time SQLite to Turso import completed",
      );
    } finally {
      removeImportLock(localPath);
    }
  } finally {
    await local.$client.close();
  }
}
