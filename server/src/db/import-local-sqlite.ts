import { existsSync } from "node:fs";
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
    sql`INSERT INTO ${sql.identifier(META_TABLE)} (key, value, updated_at) VALUES (${IMPORT_MARKER_KEY}, ${value}, ${now})
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
}

async function countRows(target: AppDb, table: string): Promise<number> {
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
 */
export async function importLocalSqliteIfNeeded(): Promise<void> {
  if (dbMode !== "remote") return;

  const localPath =
    process.env.SQLITE_IMPORT_PATH?.trim() || process.env.DB_PATH?.trim() || "./data/mybike.db";
  if (!existsSync(localPath)) {
    return;
  }

  if (await getImportMarker()) {
    return;
  }

  const local = await openLocalDb(localPath);
  try {
    const localBikes = await countRows(local, "bikes");
    const localActivities = await countRows(local, "strava_activities");
    const remoteBikes = await countRows(db, "bikes");
    const remoteActivities = await countRows(db, "strava_activities");

    const localHasDomainData = localBikes > 0 || localActivities > 0;
    const remoteHasDomainData = remoteBikes > 0 || remoteActivities > 0;

    if (!localHasDomainData) {
      await setImportMarker("skipped-empty-local");
      log.info({ localPath }, "Skipping SQLite import: local file has no bike/activity data");
      return;
    }

    if (remoteHasDomainData && remoteBikes >= localBikes && remoteActivities >= localActivities) {
      await setImportMarker("skipped-remote-has-data");
      log.info(
        { localPath, localBikes, localActivities, remoteBikes, remoteActivities },
        "Skipping SQLite import: remote already has domain data",
      );
      return;
    }

    log.info(
      { localPath, localBikes, localActivities, remoteBikes, remoteActivities },
      "Starting one-time SQLite to Turso import",
    );

    let totalRows = 0;
    for (const table of COPY_TABLES) {
      const copied = await copyTable(local, table);
      if (copied > 0) {
        log.info({ table, copied }, "Imported table rows from local SQLite");
        totalRows += copied;
      }
    }

    await setImportMarker("completed");
    log.info({ localPath, totalRows }, "One-time SQLite to Turso import completed");
  } finally {
    await local.$client.close();
  }
}
