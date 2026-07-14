import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Client } from "@libsql/client";
import { createClient } from "@tursodatabase/serverless/compat";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import type { TursoDatabaseDatabase } from "drizzle-orm/tursodatabase/driver-core";
import { relations } from "./relations.js";
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

async function createRemoteDb(url: string, authToken: string): Promise<AppDb> {
  // Official remote path: Turso serverless compat client + public drizzle-orm/libsql.
  // @libsql/client is required by drizzle-orm/libsql's module graph (even when we
  // pass our own client) — we do not call libsql's createClient.
  const client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzleLibsql({
    client: client as unknown as Client,
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
