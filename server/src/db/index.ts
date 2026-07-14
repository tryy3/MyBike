import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@tursodatabase/serverless/compat";
import type { TursoDatabaseDatabase } from "drizzle-orm/tursodatabase/driver-core";
import { relations } from "./relations.js";
import { child } from "../lib/logging/index.js";

const log = child({ component: "db" });

export type DbMode = "local" | "remote";

/** Async SQLite Drizzle DB — local Turso Database or remote serverless (compat). */
export type AppDb = TursoDatabaseDatabase & { $client: unknown };

export let db!: AppDb;
export let dbMode: DbMode = "local";

type LibsqlConstruct = (client: unknown, config?: { relations?: typeof relations }) => AppDb;

async function createRemoteDb(url: string, authToken: string): Promise<AppDb> {
  const client = createClient({ url, authToken });
  // Match local mode: enforce FK cascades (libSQL supports this pragma remotely).
  await client.execute("PRAGMA foreign_keys = ON");
  // Use drizzle-orm/libsql's internal construct so we can pass the serverless
  // compat client without adding a runtime @libsql/client dependency.
  const { construct } = (await import("drizzle-orm/libsql/driver-core")) as unknown as {
    construct: LibsqlConstruct;
  };
  return construct(client, { relations });
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
