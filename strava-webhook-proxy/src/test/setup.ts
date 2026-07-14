import { mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const testDir = mkdtempSync(join(tmpdir(), "strava-webhook-proxy-test-"));
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.STRAVA_WEBHOOK_PROXY_DB_PATH = join(testDir, "test.db");
process.env.STRAVA_WEBHOOK_PROXY_API_KEY = "test-proxy-api-key";
process.env.STRAVA_VERIFY_TOKEN = "test-verify-token";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
process.env.DRIZZLE_MIGRATIONS_FOLDER = migrationsFolder;

const { initDatabase } = await import("../db/index.js");
const { applyMigrations } = await import("../db/migrate.js");

await initDatabase();
await applyMigrations();
