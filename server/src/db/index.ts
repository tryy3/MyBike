import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { relations } from "./relations.js";

const dbPath = process.env.DB_PATH ?? "./data/mybike.db";

// Ensure the parent directory exists so a fresh checkout can create the DB file.
const dir = dirname(dbPath);
if (dir && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle({ client: sqlite, relations });
export { sqlite };
