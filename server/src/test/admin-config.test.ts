import { sql } from "drizzle-orm";
import { APP_SETTING_KEYS } from "shared";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "../db/index.js";
import { decryptSecret, requireConfigEncryptionKey } from "../lib/config-crypto.js";
import { SETTINGS_REGISTRY } from "../lib/settings-registry.js";
import { createAppConfigService } from "../services/app-config.js";

const ACTOR_USER_ID = "admin-config-test-actor";
const TEST_ENV = {
  CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY,
} satisfies NodeJS.ProcessEnv;

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
      'Admin Config Test Actor',
      'admin-config-test@example.com',
      1,
      ${now},
      ${now}
    )
  `);
}

async function insertSetting(key: string, value: unknown, isSecret = false) {
  await db.run(sql`
    INSERT INTO app_settings (key, value, is_secret, updated_at, updated_by)
    VALUES (${key}, ${JSON.stringify(value)}, ${isSecret ? 1 : 0}, ${Date.now()}, ${ACTOR_USER_ID})
  `);
}

beforeEach(async () => {
  await resetConfigTables();
});

describe("settings registry", () => {
  it("contains the exact Phase 1 setting definitions", () => {
    expect(Object.keys(SETTINGS_REGISTRY)).toEqual([...APP_SETTING_KEYS]);
    expect(SETTINGS_REGISTRY["logging.level"]).toMatchObject({
      key: "logging.level",
      defaultValue: "info",
      effect: "hotReload",
      secret: false,
      group: "Logging",
      label: "Log level",
      description: "How much the server writes to logs.",
    });
    expect(SETTINGS_REGISTRY["strava.webhook.proxyApiKey"]).toMatchObject({
      key: "strava.webhook.proxyApiKey",
      defaultValue: "",
      effect: "hotReload",
      secret: true,
    });
    expect(SETTINGS_REGISTRY["betterAuth.baseUrl"].envOverride).toEqual({
      varName: "BETTER_AUTH_URL",
    });
    expect(SETTINGS_REGISTRY["client.url"].envOverride).toEqual({
      varName: "CLIENT_URL",
    });
  });
});

describe("app config service", () => {
  it("reports whether the service has loaded effective settings", async () => {
    const service = createAppConfigService({ env: TEST_ENV });

    expect(service.isLoaded()).toBe(false);

    await service.load();

    expect(service.isLoaded()).toBe(true);
  });

  it("uses default source when neither DB nor env override is set", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    expect(service.get<string>("logging.level")).toBe("info");
    expect(service.getEffectiveMeta("logging.level")).toMatchObject({
      key: "logging.level",
      value: "info",
      source: "default",
      effect: "hotReload",
      isSecret: false,
      isSet: false,
      label: "Log level",
      description: "How much the server writes to logs.",
      group: "Logging",
      pendingRestart: false,
    });
  });

  it("uses DB overrides ahead of defaults", async () => {
    await insertSetting("logging.level", "debug");

    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    expect(service.get<string>("logging.level")).toBe("debug");
    expect(service.getEffectiveMeta("logging.level")).toMatchObject({
      value: "debug",
      source: "database",
      isSet: true,
    });
  });

  it("uses opted-in env overrides ahead of DB values", async () => {
    await insertSetting("betterAuth.baseUrl", "http://db.example.test");

    const service = createAppConfigService({
      env: {
        ...TEST_ENV,
        BETTER_AUTH_URL: "https://env.example.test",
      },
    });
    await service.load();

    expect(service.get<string>("betterAuth.baseUrl")).toBe("https://env.example.test");
    expect(service.getEffectiveMeta("betterAuth.baseUrl")).toMatchObject({
      value: "https://env.example.test",
      source: "env",
      envVar: "BETTER_AUTH_URL",
      isSet: true,
    });
  });

  it("encrypts secret settings in DB and masks them in listEffective", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    await service.set("strava.webhook.proxyApiKey", "secret-token", ACTOR_USER_ID);

    const rows = await db.all<{ value: string; isSecret: number }>(sql`
      SELECT value, is_secret AS isSecret
      FROM app_settings
      WHERE key = 'strava.webhook.proxyApiKey'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isSecret).toBe(1);
    expect(rows[0]?.value).not.toContain("secret-token");
    expect(decryptSecret(rows[0]!.value, requireConfigEncryptionKey(TEST_ENV))).toBe(
      JSON.stringify("secret-token"),
    );

    const meta = service.getEffectiveMeta("strava.webhook.proxyApiKey");
    expect(meta.value).toBeNull();
    expect(meta.isSecret).toBe(true);
    expect(meta.isSet).toBe(true);

    const listed = service
      .listEffective()
      .find((setting) => setting.key === "strava.webhook.proxyApiKey");
    expect(listed).toMatchObject({
      value: null,
      isSecret: true,
      isSet: true,
      pendingRestart: false,
    });
  });

  it("hot-reloads settings and notifies subscribers on set", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();
    const seen: unknown[] = [];

    const unsubscribe = service.onChange("logging.level", (value) => {
      seen.push(value);
    });
    const result = await service.set("logging.level", "debug", ACTOR_USER_ID);
    unsubscribe();

    expect(result).toEqual({ pendingRestart: false });
    expect(service.get<string>("logging.level")).toBe("debug");
    expect(seen).toEqual(["debug"]);
    expect(service.isRestartPending()).toBe(false);
  });

  it("keeps restart-required runtime reads on the boot value while exposing pending stored value", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    const result = await service.set("logging.toFile", false, ACTOR_USER_ID);

    expect(result).toEqual({ pendingRestart: true });
    expect(service.get<boolean>("logging.toFile")).toBe(true);
    expect(service.isRestartPending()).toBe(true);
    expect(service.getEffectiveMeta("logging.toFile")).toMatchObject({
      value: false,
      source: "database",
      pendingRestart: true,
    });
    expect(
      service.listEffective().find((setting) => setting.key === "logging.toFile"),
    ).toMatchObject({
      value: false,
      pendingRestart: true,
    });

    const pendingRows = await db.all<{ value: string }>(sql`
      SELECT value
      FROM app_runtime_state
      WHERE key = 'pending_restart'
    `);
    expect(pendingRows).toEqual([{ value: "1" }]);
  });

  it("writes an audit row for setting changes", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    await service.set("logging.level", "debug", ACTOR_USER_ID);

    const auditRows = await db.all<{
      actorUserId: string | null;
      key: string;
      oldValue: string | null;
      newValue: string | null;
    }>(sql`
      SELECT
        actor_user_id AS actorUserId,
        key,
        old_value AS oldValue,
        new_value AS newValue
      FROM config_audit_log
      WHERE key = 'logging.level'
    `);

    expect(auditRows).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        key: "logging.level",
        oldValue: JSON.stringify("info"),
        newValue: JSON.stringify("debug"),
      },
    ]);
  });

  it("applies setMany atomically and rolls back when a later value is invalid", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();

    await expect(
      service.setMany(
        [
          { key: "logging.level", value: "debug" },
          { key: "graphql.timing", value: "not-a-boolean" },
        ],
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow();

    expect(service.get<string>("logging.level")).toBe("info");
    expect(service.getEffectiveMeta("logging.level").source).toBe("default");

    const settingRows = await db.all<{ key: string }>(sql`
      SELECT key FROM app_settings WHERE key IN ('logging.level', 'graphql.timing')
    `);
    expect(settingRows).toEqual([]);

    const auditRows = await db.all<{ key: string }>(sql`
      SELECT key FROM config_audit_log
    `);
    expect(auditRows).toEqual([]);
  });

  it("persists multiple setMany updates in one batch", async () => {
    const service = createAppConfigService({ env: TEST_ENV });
    await service.load();
    const seen: unknown[] = [];
    const unsubscribe = service.onChange("logging.level", (value) => {
      seen.push(value);
    });

    const result = await service.setMany(
      [
        { key: "logging.level", value: "warn" },
        { key: "graphql.timing", value: true },
      ],
      ACTOR_USER_ID,
    );
    unsubscribe();

    expect(result).toEqual({ pendingRestart: false });
    expect(service.get<string>("logging.level")).toBe("warn");
    expect(service.get<boolean>("graphql.timing")).toBe(true);
    expect(seen).toEqual(["warn"]);

    const auditKeys = await db.all<{ key: string }>(sql`
      SELECT key FROM config_audit_log ORDER BY key
    `);
    expect(auditKeys.map((row) => row.key)).toEqual(["graphql.timing", "logging.level"]);
  });
});
