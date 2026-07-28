import { sql } from "drizzle-orm";
import type { AppSettingKey, SettingEffect, SettingValueSource } from "shared";
import { db as defaultDb, type AppDb } from "../db/index.js";
import { decryptSecret, encryptSecret, requireConfigEncryptionKey } from "../lib/config-crypto.js";
import {
  SETTINGS_DEFINITIONS,
  SETTINGS_REGISTRY,
  type SettingDefinition,
} from "../lib/settings-registry.js";
import { writeAdminAudit } from "./admin-audit.js";

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
  description: string;
  group: string;
  pendingRestart: boolean;
  readOnly: boolean;
  inheritWhen?: string;
  inheritFrom?: string;
};

type ChangeHandler = (value: unknown) => void;

export type AppConfigUpdate = {
  key: string;
  value: unknown;
};

export type AppConfigService = {
  load(): Promise<void>;
  isLoaded(): boolean;
  get<T>(key: string): T;
  getEffectiveMeta(key: string): EffectiveSetting;
  listEffective(): EffectiveSetting[];
  set(
    key: string,
    value: unknown,
    actorUserId: string | null,
  ): Promise<{ pendingRestart: boolean }>;
  setMany(
    updates: AppConfigUpdate[],
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

    // Phase 1: resolve every key on its own terms (env > DB > default).
    const resolved = new Map<AppSettingKey, ResolvedSetting>(
      SETTINGS_DEFINITIONS.map((definition) => [
        definition.key,
        resolveSetting(definition, rows.get(definition.key)),
      ]),
    );

    // Phase 2: settings that inherit from another key take that key's value
    // (and become read-only) whenever their toggle resolves to true.
    for (const definition of SETTINGS_DEFINITIONS) {
      if (!definition.inheritWhen || !definition.inheritFrom) continue;

      const toggle = resolved.get(definition.inheritWhen);
      if (toggle?.value !== true) continue;

      const source = resolved.get(definition.inheritFrom);
      if (!source) continue;

      resolved.set(definition.key, {
        key: definition.key,
        value: source.value,
        source: "inherited",
      });
    }

    return resolved;
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

  function isNonEmptyValue(value: unknown): boolean {
    return value !== "" && value !== null && value !== undefined;
  }

  function toEffectiveSetting(key: AppSettingKey): EffectiveSetting {
    const definition = SETTINGS_REGISTRY[key];
    const effective = storedEffective.get(key);
    if (!effective) {
      throw new Error(`App setting ${key} has not been loaded`);
    }

    const isSet =
      effective.source === "inherited"
        ? isNonEmptyValue(effective.value)
        : effective.source !== "default";

    return {
      key,
      value: displayValue(definition, effective.value),
      source: effective.source,
      effect: definition.effect,
      isSecret: definition.secret === true,
      isSet,
      envVar: definition.envOverride?.varName,
      label: definition.label,
      description: definition.description,
      group: definition.group,
      pendingRestart: settingPendingRestart(key),
      readOnly: effective.source === "env" || effective.source === "inherited",
      inheritWhen: definition.inheritWhen,
      inheritFrom: definition.inheritFrom,
    };
  }

  async function clearRestartPending(): Promise<void> {
    await getDb().run(sql`DELETE FROM app_runtime_state WHERE key = ${PENDING_RESTART_KEY}`);
  }

  async function setMany(
    updates: AppConfigUpdate[],
    actorUserId: string | null,
  ): Promise<{ pendingRestart: boolean }> {
    ensureLoaded();
    if (updates.length === 0) {
      return { pendingRestart: computePendingRestart() };
    }

    // Validate and prepare every update before any writes so a late failure
    // cannot leave earlier keys partially persisted.
    const knownUpdates = updates.map((update) => {
      const knownKey = assertKnownKey(update.key);
      const definition = SETTINGS_REGISTRY[knownKey];
      const parsed = definition.schema.parse(update.value);

      if (definition.secret && parsed === "") {
        throw new Error(`Secret app setting ${knownKey} requires a non-empty value`);
      }

      return { knownKey, definition, parsed };
    });

    const batchValues = new Map<AppSettingKey, unknown>(
      knownUpdates.map((item) => [item.knownKey, item.parsed]),
    );

    // Block writes to inheritable leaves while their toggle resolves to
    // true post-batch (using the new value if the same batch also flips the
    // toggle, otherwise the pre-update effective value).
    for (const { knownKey, definition } of knownUpdates) {
      if (!definition.inheritWhen || !definition.inheritFrom) continue;

      const postBatchInherit = batchValues.has(definition.inheritWhen)
        ? batchValues.get(definition.inheritWhen) === true
        : storedEffective.get(definition.inheritWhen)?.value === true;

      if (postBatchInherit) {
        throw new Error(
          `Cannot update ${knownKey} while ${definition.inheritWhen} is enabled; disable inherit first`,
        );
      }
    }

    const prepared = knownUpdates.map(({ knownKey, definition, parsed }) => {
      const previous = storedEffective.get(knownKey);
      const plaintext = JSON.stringify(parsed);
      const storedValue = definition.secret
        ? encryptSecret(plaintext, getEncryptionKey())
        : plaintext;

      return {
        knownKey,
        definition,
        storedValue,
        auditOldValue: definition.secret ? "***" : JSON.stringify(previous?.value),
        auditNewValue: definition.secret ? "***" : plaintext,
      };
    });

    const now = Date.now();
    await getDb().transaction(async (tx) => {
      for (const item of prepared) {
        await tx.run(sql`
          INSERT INTO app_settings (key, value, is_secret, updated_at, updated_by)
          VALUES (
            ${item.knownKey},
            ${item.storedValue},
            ${item.definition.secret ? 1 : 0},
            ${now},
            ${actorUserId}
          )
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            is_secret = excluded.is_secret,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by
        `);
        await writeAdminAudit({
          actorUserId,
          key: item.knownKey,
          oldValue: item.auditOldValue,
          newValue: item.auditNewValue,
          db: tx,
        });
      }
    });

    storedEffective = await computeEffective();

    for (const item of prepared) {
      if (item.definition.effect !== "hotReload") continue;
      const current = storedEffective.get(item.knownKey);
      if (!current) continue;
      bootSnapshot.set(item.knownKey, { ...current, value: cloneValue(current.value) });
      for (const subscriber of subscribers.get(item.knownKey) ?? []) {
        subscriber(current.value);
      }
    }

    await persistPendingRestart();
    return { pendingRestart: computePendingRestart() };
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

    isLoaded(): boolean {
      return loaded;
    },

    get<T>(key: string): T {
      ensureLoaded();
      const knownKey = assertKnownKey(key);
      const definition = SETTINGS_REGISTRY[knownKey];
      // Inheritable leaves always mirror the live effective computation
      // (inherited or not); the restart-required freeze only applies to
      // directly stored values.
      const source =
        definition.effect === "restartRequired" && !definition.inheritWhen
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
      return setMany([{ key, value }], actorUserId);
    },

    setMany,

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

export function getLoadedAppConfigValue<T>(key: string): T | null {
  if (!appConfig.isLoaded()) {
    return null;
  }

  try {
    return appConfig.get<T>(key);
  } catch {
    return null;
  }
}
