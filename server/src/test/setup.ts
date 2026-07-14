import { mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const testDir = mkdtempSync(join(tmpdir(), "mybike-test-"));
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.DB_PATH = join(testDir, "test.db");
process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-long-enough-for-dev-32";
process.env.BETTER_AUTH_URL = "http://localhost:3001";
process.env.CLIENT_URL = "http://localhost:5173";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
process.env.DRIZZLE_MIGRATIONS_FOLDER = migrationsFolder;

const { initDatabase } = await import("../db/index.js");
const { applyMigrations } = await import("../db/migrate.js");

await initDatabase();
await applyMigrations();
