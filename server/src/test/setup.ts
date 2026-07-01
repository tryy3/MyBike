import { mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const testDir = mkdtempSync(join(tmpdir(), "mybike-test-"));
process.env.DB_PATH = join(testDir, "test.db");

const { db } = await import("../db/index.js");
const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);
migrate(db, { migrationsFolder });
