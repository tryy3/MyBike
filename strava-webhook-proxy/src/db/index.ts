import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const dbPath = process.env.STRAVA_WEBHOOK_PROXY_DB_PATH ?? "./data/strava-webhook-proxy.db";

const dir = dirname(dbPath);
if (dir && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle({ client: sqlite });
export { sqlite };
