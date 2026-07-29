import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "../db/index.js";
import {
  applyProcessLoggerLevel,
  syncAuthEnvFromConfig,
  syncLoggingEnvFromConfig,
} from "../lib/runtime-config.js";
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

    const unsubscribe = applyProcessLoggerLevel(service);
    await service.set("logging.level", "debug", ACTOR_USER_ID);
    unsubscribe();

    expect(logger.level).toBe("debug");
  });
});

describe("syncAuthEnvFromConfig", () => {
  it("always overwrites leftover CLIENT_URL and BETTER_AUTH_URL from effective config", async () => {
    await db.run(sql`
      INSERT INTO app_settings (key, value, is_secret, updated_at, updated_by)
      VALUES
        ('client.url', ${JSON.stringify("https://app.from-db.test")}, 0, ${Date.now()}, ${ACTOR_USER_ID}),
        ('betterAuth.baseUrl', ${JSON.stringify("https://api.from-db.test")}, 0, ${Date.now()}, ${ACTOR_USER_ID})
    `);
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    const env: NodeJS.ProcessEnv = {
      CLIENT_URL: "https://stale.env.test",
      BETTER_AUTH_URL: "https://stale-api.env.test",
    };
    syncAuthEnvFromConfig(service, env);

    expect(env.CLIENT_URL).toBe("https://app.from-db.test");
    expect(env.BETTER_AUTH_URL).toBe("https://api.from-db.test");
  });
});

describe("syncLoggingEnvFromConfig", () => {
  it("writes the effective logging.toFile config into LOG_TO_FILE", async () => {
    await db.run(sql`
      INSERT INTO app_settings (key, value, is_secret, updated_at, updated_by)
      VALUES ('logging.toFile', 'false', 0, ${Date.now()}, ${ACTOR_USER_ID})
    `);
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    const env: NodeJS.ProcessEnv = {};
    syncLoggingEnvFromConfig(service, env);

    expect(env.LOG_TO_FILE).toBe("false");
  });

  it("writes logging.level and logging.redact and always overwrites existing env values", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();
    await service.set("logging.level", "warn", ACTOR_USER_ID);

    const env: NodeJS.ProcessEnv = { LOG_LEVEL: "stale", LOG_REDACT: "stale" };
    syncLoggingEnvFromConfig(service, env);

    expect(env.LOG_LEVEL).toBe("warn");
    expect(env.LOG_TO_FILE).toBe("true");
    expect(env.LOG_REDACT).toBe("true");
  });

  it("deletes LOG_FILE_PATH when logging.filePath is empty", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    const env: NodeJS.ProcessEnv = { LOG_FILE_PATH: "/stale/path.log" };
    syncLoggingEnvFromConfig(service, env);

    expect(env.LOG_FILE_PATH).toBeUndefined();
  });

  it("sets LOG_FILE_PATH when logging.filePath is configured", async () => {
    await db.run(sql`
      INSERT INTO app_settings (key, value, is_secret, updated_at, updated_by)
      VALUES ('logging.filePath', ${JSON.stringify("/var/log/mybike.log")}, 0, ${Date.now()}, ${ACTOR_USER_ID})
    `);
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    const env: NodeJS.ProcessEnv = {};
    syncLoggingEnvFromConfig(service, env);

    expect(env.LOG_FILE_PATH).toBe("/var/log/mybike.log");
  });
});
