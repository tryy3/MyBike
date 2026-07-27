import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "../db/index.js";
import { applyLoggingLevelConfig } from "../lib/runtime-config.js";
import { logger } from "../lib/logging/index.js";
import { createAppConfigService } from "../services/app-config.js";

const ACTOR_USER_ID = "runtime-config-test-actor";
const TEST_ENV = {
  CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY,
} satisfies NodeJS.ProcessEnv;

let originalLoggerLevel: string;

async function resetConfigTables() {
  await db.run(sql`DELETE FROM config_audit_log`);
  await db.run(sql`DELETE FROM app_runtime_state`);
  await db.run(sql`DELETE FROM app_settings`);
  const now = Date.now();
  await db.run(sql`
    INSERT OR IGNORE INTO "user" (
      id,
      name,
      email,
      email_verified,
      created_at,
      updated_at
    )
    VALUES (
      ${ACTOR_USER_ID},
      'Runtime Config Test Actor',
      'runtime-config-test@example.com',
      1,
      ${now},
      ${now}
    )
  `);
}

beforeEach(async () => {
  originalLoggerLevel = logger.level;
  await resetConfigTables();
});

afterEach(() => {
  logger.level = originalLoggerLevel;
});

describe("runtime config consumers", () => {
  it("applies logging.level immediately and when the setting changes", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    const unsubscribe = applyLoggingLevelConfig(service, logger);
    await service.set("logging.level", "debug", ACTOR_USER_ID);
    unsubscribe();

    expect(logger.level).toBe("debug");
  });
});
