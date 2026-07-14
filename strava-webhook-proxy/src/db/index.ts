import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Client } from "@libsql/client";
import { createClient } from "@tursodatabase/serverless/compat";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import type { TursoDatabaseDatabase } from "drizzle-orm/tursodatabase/driver-core";
import { child } from "../lib/logging/index.js";

const log = child({ component: "db" });

export type DbMode = "local" | "remote";

export type AppDb = TursoDatabaseDatabase & { $client: unknown };

export let db!: AppDb;
export let dbMode: DbMode = "local";

async function createRemoteDb(url: string, authToken: string): Promise<AppDb> {
  const client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzleLibsql({
    client: client as unknown as Client,
  }) as unknown as AppDb;
}

async function createLocalDb(dbPath: string): Promise<AppDb> {
  const { connect } = await import("@tursodatabase/database");
  const { drizzle } = await import("drizzle-orm/tursodatabase/database");

  const dir = dirname(dbPath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const client = await connect(dbPath);
  await client.exec("PRAGMA foreign_keys = ON");
  return drizzle({ client }) as AppDb;
}

/**
 * Prefer Turso Cloud when both proxy Turso env vars are set; otherwise use a
 * local Turso Database file at STRAVA_WEBHOOK_PROXY_DB_PATH.
 */
export async function initDatabase(): Promise<AppDb> {
  const url = process.env.STRAVA_WEBHOOK_PROXY_TURSO_DATABASE_URL?.trim();
  const authToken = process.env.STRAVA_WEBHOOK_PROXY_TURSO_AUTH_TOKEN?.trim();

  if (url && authToken) {
    dbMode = "remote";
    db = await createRemoteDb(url, authToken);
    log.info({ mode: dbMode }, "Database connected");
    return db;
  }

  if (url || authToken) {
    throw new Error(
      "Turso Cloud requires both STRAVA_WEBHOOK_PROXY_TURSO_DATABASE_URL and STRAVA_WEBHOOK_PROXY_TURSO_AUTH_TOKEN (or neither for local file mode)",
    );
  }

  const dbPath = process.env.STRAVA_WEBHOOK_PROXY_DB_PATH ?? "./data/strava-webhook-proxy.db";
  dbMode = "local";
  db = await createLocalDb(dbPath);
  log.info({ mode: dbMode, dbPath }, "Database connected");
  return db;
}
