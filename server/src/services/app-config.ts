import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AppSettingKey, SettingEffect, SettingValueSource } from "shared";
import { db as defaultDb, type AppDb } from "../db/index.js";
import { decryptSecret, encryptSecret, requireConfigEncryptionKey } from "../lib/config-crypto.js";
import {
  SETTINGS_DEFINITIONS,
  SETTINGS_REGISTRY,
  type SettingDefinition,
} from "../lib/settings-registry.js";

type StoredSettingRow = {
  key: string;
  value: string;
  isSecret: number | boolean;
};

type ResolvedSetting = {
  key: AppSettingKey;
  value: unknown;
  source: SettingValueSource;
};

export type EffectiveSetting = {
  key: AppSettingKey;
  value: unknown;
  source: SettingValueSource;
  effect: SettingEffect;
  isSecret: boolean;
  isSet: boolean;
  envVar?: string;
  label: string;
  group: string;
  pendingRestart: boolean;
};

type ChangeHandler = (value: unknown) => void;

export type AppConfigService = {
  load(): Promise<void>;
  get<T>(key: string): T;
  getEffectiveMeta(key: string): EffectiveSetting;
  listEffective(): EffectiveSetting[];
  set(
    key: string,
    value: unknown,
    actorUserId: string | null,
  ): Promise<{ pendingRestart: boolean }>;
  onChange(key: string, fn: ChangeHandler): () => void;
  isRestartPending(): boolean;
  markBootComplete(): Promise<void>;
  clearRestartPending(): Promise<void>;
};

export type AppConfigServiceOptions = {
  db?: AppDb;
  env?: NodeJS.ProcessEnv;
  encryptionKey?: Buffer;
};

const PENDING_RESTART_KEY = "pending_restart";

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertKnownKey(key: string): AppSettingKey {
  if (!(key in SETTINGS_REGISTRY)) {
    throw new Error(`Unknown app setting key: ${key}`);
  }
  return key as AppSettingKey;
}

function parseStoredJson(value: string, key: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Stored app setting ${key} must contain valid JSON`);
  }
}

function displayValue(definition: SettingDefinition, value: unknown): unknown {
  return definition.secret ? null : value;
}

function hasEnvOverride(definition: SettingDefinition, env: NodeJS.ProcessEnv): string | undefined {
  const envVar = definition.envOverride?.varName;
  if (!envVar) {
    return undefined;
  }

  const value = env[envVar];
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value;
}

export function createAppConfigService(options: AppConfigServiceOptions = {}): AppConfigService {
  const env = options.env ?? process.env;
  const subscribers = new Map<AppSettingKey, Set<ChangeHandler>>();
  let storedEffective = new Map<AppSettingKey, ResolvedSetting>();
  let bootSnapshot = new Map<AppSettingKey, ResolvedSetting>();
  let loaded = false;

  function getDb(): AppDb {
    return options.db ?? defaultDb;
  }

  function getEncryptionKey(): Buffer {
    return options.encryptionKey ?? requireConfigEncryptionKey(env);
  }

  async function loadDbRows(): Promise<Map<AppSettingKey, StoredSettingRow>> {
    const rows = await getDb().all<StoredSettingRow>(sql`
      SELECT key, value, is_secret AS isSecret
      FROM app_settings
    `);
    const knownRows = new Map<AppSettingKey, StoredSettingRow>();

    for (const row of rows) {
      if (row.key in SETTINGS_REGISTRY) {
        knownRows.set(row.key as AppSettingKey, row);
      }
    }

    return knownRows;
  }

  function resolveSetting(
    definition: SettingDefinition,
    row: StoredSettingRow | undefined,
  ): ResolvedSetting {
    const envValue = hasEnvOverride(definition, env);
    if (envValue !== undefined) {
      return {
        key: definition.key,
        value: definition.schema.parse(envValue),
        source: "env",
      };
    }

    if (row) {
      const stored = definition.secret ? decryptSecret(row.value, getEncryptionKey()) : row.value;
      return {
        key: definition.key,
        value: definition.schema.parse(parseStoredJson(stored, definition.key)),
        source: "database",
      };
    }

    return {
      key: definition.key,
      value: cloneValue(definition.defaultValue),
      source: "default",
    };
  }

  async function computeEffective(): Promise<Map<AppSettingKey, ResolvedSetting>> {
    const rows = await loadDbRows();
    return new Map(
      SETTINGS_DEFINITIONS.map((definition) => [
        definition.key,
        resolveSetting(definition, rows.get(definition.key)),
      ]),
    );
  }

  function ensureLoaded(): void {
    if (!loaded) {
      throw new Error("App config service must be loaded before use");
    }
  }

  function settingPendingRestart(key: AppSettingKey): boolean {
    const definition = SETTINGS_REGISTRY[key];
    if (definition.effect !== "restartRequired") {
      return false;
    }

    return !valuesEqual(storedEffective.get(key)?.value, bootSnapshot.get(key)?.value);
  }

  function computePendingRestart(): boolean {
    return SETTINGS_DEFINITIONS.some((definition) => settingPendingRestart(definition.key));
  }

  async function persistPendingRestart(): Promise<void> {
    if (!computePendingRestart()) {
      await getDb().run(sql`DELETE FROM app_runtime_state WHERE key = ${PENDING_RESTART_KEY}`);
      return;
    }

    await getDb().run(sql`
      INSERT INTO app_runtime_state (key, value)
      VALUES (${PENDING_RESTART_KEY}, '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
  }

  function toEffectiveSetting(key: AppSettingKey): EffectiveSetting {
    const definition = SETTINGS_REGISTRY[key];
    const effective = storedEffective.get(key);
    if (!effective) {
      throw new Error(`App setting ${key} has not been loaded`);
    }

    return {
      key,
      value: displayValue(definition, effective.value),
      source: effective.source,
      effect: definition.effect,
      isSecret: definition.secret === true,
      isSet: effective.source !== "default",
      envVar: definition.envOverride?.varName,
      label: definition.label,
      group: definition.group,
      pendingRestart: settingPendingRestart(key),
    };
  }

  async function clearRestartPending(): Promise<void> {
    await getDb().run(sql`DELETE FROM app_runtime_state WHERE key = ${PENDING_RESTART_KEY}`);
  }

  return {
    async load(): Promise<void> {
      storedEffective = await computeEffective();
      bootSnapshot = new Map(
        [...storedEffective.entries()].map(([key, value]) => [
          key,
          { ...value, value: cloneValue(value.value) },
        ]),
      );
      loaded = true;
      await clearRestartPending();
    },

    get<T>(key: string): T {
      ensureLoaded();
      const knownKey = assertKnownKey(key);
      const definition = SETTINGS_REGISTRY[knownKey];
      const source =
        definition.effect === "restartRequired"
          ? bootSnapshot.get(knownKey)
          : storedEffective.get(knownKey);

      if (!source) {
        throw new Error(`App setting ${knownKey} has not been loaded`);
      }

      return source.value as T;
    },

    getEffectiveMeta(key: string): EffectiveSetting {
      ensureLoaded();
      return toEffectiveSetting(assertKnownKey(key));
    },

    listEffective(): EffectiveSetting[] {
      ensureLoaded();
      return SETTINGS_DEFINITIONS.map((definition) => toEffectiveSetting(definition.key));
    },

    async set(
      key: string,
      value: unknown,
      actorUserId: string | null,
    ): Promise<{ pendingRestart: boolean }> {
      ensureLoaded();
      const knownKey = assertKnownKey(key);
      const definition = SETTINGS_REGISTRY[knownKey];
      const parsed = definition.schema.parse(value);

      if (definition.secret && parsed === "") {
        throw new Error(`Secret app setting ${knownKey} requires a non-empty value`);
      }

      const previous = storedEffective.get(knownKey);
      const plaintext = JSON.stringify(parsed);
      const storedValue = definition.secret
        ? encryptSecret(plaintext, getEncryptionKey())
        : plaintext;
      const auditOldValue = definition.secret ? "***" : JSON.stringify(previous?.value);
      const auditNewValue = definition.secret ? "***" : plaintext;
      const now = Date.now();

      await getDb().run(sql`
        INSERT INTO app_settings (key, value, is_secret, updated_at, updated_by)
        VALUES (
          ${knownKey},
          ${storedValue},
          ${definition.secret ? 1 : 0},
          ${now},
          ${actorUserId}
        )
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          is_secret = excluded.is_secret,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `);
      await getDb().run(sql`
        INSERT INTO config_audit_log (
          id,
          actor_user_id,
          key,
          old_value,
          new_value,
          created_at
        )
        VALUES (
          ${randomUUID()},
          ${actorUserId},
          ${knownKey},
          ${auditOldValue},
          ${auditNewValue},
          ${now}
        )
      `);

      storedEffective = await computeEffective();

      if (definition.effect === "hotReload") {
        const current = storedEffective.get(knownKey);
        if (current) {
          bootSnapshot.set(knownKey, { ...current, value: cloneValue(current.value) });
          for (const subscriber of subscribers.get(knownKey) ?? []) {
            subscriber(current.value);
          }
        }
      }

      await persistPendingRestart();
      return { pendingRestart: computePendingRestart() };
    },

    onChange(key: string, fn: ChangeHandler): () => void {
      const knownKey = assertKnownKey(key);
      const handlers = subscribers.get(knownKey) ?? new Set<ChangeHandler>();
      handlers.add(fn);
      subscribers.set(knownKey, handlers);

      return () => {
        handlers.delete(fn);
        if (handlers.size === 0) {
          subscribers.delete(knownKey);
        }
      };
    },

    isRestartPending(): boolean {
      ensureLoaded();
      return computePendingRestart();
    },

    async markBootComplete(): Promise<void> {
      ensureLoaded();
      bootSnapshot = new Map(
        [...storedEffective.entries()].map(([key, value]) => [
          key,
          { ...value, value: cloneValue(value.value) },
        ]),
      );
      await clearRestartPending();
    },

    clearRestartPending,
  };
}

export const appConfig = createAppConfigService();
