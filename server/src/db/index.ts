import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Client } from "@libsql/client";
import { createClient } from "@tursodatabase/serverless/compat";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import type { TursoDatabaseDatabase } from "drizzle-orm/tursodatabase/driver-core";
import { relations } from "./relations.js";
import { enumerableNamedRows } from "./result.js";
import { child } from "../lib/logging/index.js";

const log = child({ component: "db" });

export type DbMode = "local" | "remote";

/**
 * Async SQLite Drizzle DB — local Turso Database or remote serverless (compat).
 * Typed as the local adapter; remote uses the same async query surface at runtime.
 */
export type AppDb = TursoDatabaseDatabase & { $client: unknown };

export let db!: AppDb;
export let dbMode: DbMode = "local";

/**
 * Turso serverless/compat rows expose column names as non-enumerable properties.
 * drizzle-orm/libsql's normalizeRow drops those, so wrap execute/batch results.
 */
function wrapCompatClientForDrizzle(client: ReturnType<typeof createClient>): Client {
  const execute = client.execute.bind(client) as (
    stmtOrSql: Parameters<typeof client.execute>[0],
    args?: Parameters<typeof client.execute>[1],
  ) => ReturnType<typeof client.execute>;
  const batch = client.batch.bind(client);
  const migrate = client.migrate.bind(client);
  const transaction = client.transaction.bind(client);

  type ExecuteStmt = Parameters<typeof client.execute>[0];
  type ExecuteArgs = Parameters<typeof client.execute>[1];

  client.execute = ((stmtOrSql: ExecuteStmt, args?: ExecuteArgs) =>
    execute(stmtOrSql, args).then(enumerableNamedRows)) as typeof client.execute;

  client.batch = (async (stmts, mode) => {
    const results = await batch(stmts, mode);
    return results.map((result) => enumerableNamedRows(result));
  }) as typeof client.batch;

  client.migrate = (async (stmts) => {
    const results = await migrate(stmts);
    return results.map((result) => enumerableNamedRows(result));
  }) as typeof client.migrate;

  client.transaction = (async (mode) => {
    const tx = await transaction(mode);
    const txExecute = tx.execute.bind(tx) as typeof execute;
    const txBatch = tx.batch.bind(tx);
    tx.execute = ((stmtOrSql: ExecuteStmt, args?: ExecuteArgs) =>
      txExecute(stmtOrSql, args).then(enumerableNamedRows)) as typeof tx.execute;
    tx.batch = (async (stmts) => {
      const results = await txBatch(stmts);
      return results.map((result) => enumerableNamedRows(result));
    }) as typeof tx.batch;
    return tx;
  }) as typeof client.transaction;

  return client as unknown as Client;
}

async function createRemoteDb(url: string, authToken: string): Promise<AppDb> {
  // Official remote path: Turso serverless compat client + public drizzle-orm/libsql.
  // @libsql/client is required by drizzle-orm/libsql's module graph (even when we
  // pass our own client) — we do not call libsql's createClient.
  const client = wrapCompatClientForDrizzle(createClient({ url, authToken }));
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzleLibsql({
    client,
    relations,
  }) as unknown as AppDb;
}

async function createLocalDb(dbPath: string): Promise<AppDb> {
  // Dynamic import keeps the native optional package off the remote-only path.
  const { connect } = await import("@tursodatabase/database");
  const { drizzle } = await import("drizzle-orm/tursodatabase/database");

  const dir = dirname(dbPath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const client = await connect(dbPath);
  await client.exec("PRAGMA foreign_keys = ON");
  return drizzle({ client, relations }) as AppDb;
}

/**
 * Opens the database. Prefer Turso Cloud when URL + token are set; otherwise
 * use a local Turso Database file at DB_PATH (default ./data/mybike.db).
 */
export async function initDatabase(): Promise<AppDb> {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (url && authToken) {
    dbMode = "remote";
    db = await createRemoteDb(url, authToken);
    log.info({ mode: dbMode }, "Database connected");
    return db;
  }

  if (url || authToken) {
    throw new Error(
      "Turso Cloud requires both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (or neither for local file mode)",
    );
  }

  const dbPath = process.env.DB_PATH ?? "./data/mybike.db";
  dbMode = "local";
  db = await createLocalDb(dbPath);
  log.info({ mode: dbMode, dbPath }, "Database connected");
  return db;
}
