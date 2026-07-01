import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
import * as authSchema from "./auth-schema";

const dbPath = process.env.DB_PATH ?? "./data/mybike.db";

// Ensure the parent directory exists so a fresh checkout can create the DB file.
const dir = dirname(dbPath);
if (dir && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema: { ...schema, ...authSchema } });
export { sqlite };
