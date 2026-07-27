import { APP_SETTING_KEYS, type AppSettingKey, type SettingEffect } from "shared";
import { z, type ZodType } from "zod";

export type SettingDefinition<T = unknown> = {
  key: AppSettingKey;
  schema: ZodType<T>;
  defaultValue: T;
  effect: SettingEffect;
  secret?: boolean;
  envOverride?: { varName: string };
  group: string;
  label: string;
};

const loggingLevelSchema = z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);
const urlSchema = z.string().url();

const settingDefinitions = [
  {
    key: "logging.level",
    schema: loggingLevelSchema,
    defaultValue: "info",
    effect: "hotReload",
    secret: false,
    group: "Logging",
    label: "Log level",
  },
  {
    key: "graphql.timing",
    schema: z.boolean(),
    defaultValue: false,
    effect: "hotReload",
    secret: false,
    group: "GraphQL",
    label: "Request timing",
  },
  {
    key: "strava.webhook.pollIntervalMs",
    schema: z.number().int().positive(),
    defaultValue: 60_000,
    effect: "hotReload",
    secret: false,
    group: "Strava webhook",
    label: "Poll interval (ms)",
  },
  {
    key: "strava.webhook.proxyApiKey",
    schema: z.string(),
    defaultValue: "",
    effect: "hotReload",
    secret: true,
    group: "Strava webhook",
    label: "Proxy API key",
  },
  {
    key: "logging.toFile",
    schema: z.boolean(),
    defaultValue: true,
    effect: "restartRequired",
    secret: false,
    group: "Logging",
    label: "Write logs to file",
  },
  {
    key: "betterAuth.baseUrl",
    schema: urlSchema,
    defaultValue: "http://localhost:3001",
    effect: "restartRequired",
    secret: false,
    envOverride: { varName: "BETTER_AUTH_URL" },
    group: "Authentication",
    label: "Better Auth base URL",
  },
  {
    key: "client.url",
    schema: urlSchema,
    defaultValue: "http://localhost:5173",
    effect: "restartRequired",
    secret: false,
    envOverride: { varName: "CLIENT_URL" },
    group: "Client",
    label: "Client URL",
  },
] satisfies SettingDefinition[];

if (
  settingDefinitions.map((definition) => definition.key).join("\0") !== APP_SETTING_KEYS.join("\0")
) {
  throw new Error("SETTINGS_REGISTRY must match APP_SETTING_KEYS order");
}

export const SETTINGS_REGISTRY: Record<AppSettingKey, SettingDefinition> =
  settingDefinitions.reduce(
    (registry, definition) => {
      registry[definition.key] = definition;
      return registry;
    },
    {} as Record<AppSettingKey, SettingDefinition>,
  );

export const SETTINGS_DEFINITIONS = settingDefinitions;
