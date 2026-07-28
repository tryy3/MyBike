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
  /** Short row copy shown under the label in admin UI. */
  description: string;
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
    description: "How much the server writes to logs.",
  },
  {
    key: "graphql.timing",
    schema: z.boolean(),
    defaultValue: false,
    effect: "hotReload",
    secret: false,
    group: "GraphQL",
    label: "Request timing",
    description: "Log how long GraphQL requests take.",
  },
  {
    key: "strava.webhook.pollIntervalMs",
    schema: z.number().int().positive(),
    defaultValue: 60_000,
    effect: "hotReload",
    secret: false,
    group: "Strava webhook",
    label: "Poll interval (ms)",
    description: "How often to pull events from the proxy.",
  },
  {
    key: "strava.webhook.proxyApiKey",
    schema: z.string(),
    defaultValue: "",
    effect: "hotReload",
    secret: true,
    group: "Strava webhook",
    label: "Proxy API key",
    description: "Secret used to authenticate with the proxy.",
  },
  {
    key: "logging.toFile",
    schema: z.boolean(),
    defaultValue: true,
    effect: "restartRequired",
    secret: false,
    group: "Logging",
    label: "Write logs to file",
    description: "Also write logs to a file on disk.",
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
    description: "Public base URL used by Better Auth.",
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
    description: "Browser origin allowed to talk to the API.",
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
