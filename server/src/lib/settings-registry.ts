import { APP_SETTING_KEYS, type AppSettingKey, type SettingEffect } from "shared";
import { z, type ZodType } from "zod";

export type SettingDefinition<T = unknown> = {
  key: AppSettingKey;
  schema: ZodType<T>;
  defaultValue: T;
  effect: SettingEffect;
  secret?: boolean;
  envOverride?: { varName: string };
  inheritWhen?: AppSettingKey;
  inheritFrom?: AppSettingKey;
  group: string;
  label: string;
  /** Short row copy shown under the label in admin UI. */
  description: string;
};

const loggingLevelSchema = z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);
const urlSchema = z.string().url();
const optionalUrlSchema = z.union([z.literal(""), urlSchema]);

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
    key: "logging.filePath",
    schema: z.string(),
    defaultValue: "",
    effect: "restartRequired",
    secret: false,
    group: "Logging",
    label: "Log file path",
    description: "Path for the server log file.",
  },
  {
    key: "logging.redact",
    schema: z.boolean(),
    defaultValue: true,
    effect: "restartRequired",
    secret: false,
    group: "Logging",
    label: "Redact sensitive log data",
    description: "Remove sensitive values from log output.",
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
    key: "strava.webhook.proxyUrl",
    schema: optionalUrlSchema,
    defaultValue: "",
    effect: "hotReload",
    secret: false,
    group: "Strava webhook",
    label: "Proxy URL",
    description: "Public URL of the Strava webhook proxy.",
  },
  {
    key: "strava.webhook.subscriptionId",
    schema: z.string(),
    defaultValue: "",
    effect: "hotReload",
    secret: false,
    group: "Strava webhook",
    label: "Subscription ID",
    description: "Strava webhook subscription identifier.",
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
  {
    key: "oauth.providers.tsidp.enabled",
    schema: z.boolean(),
    defaultValue: false,
    effect: "restartRequired",
    secret: false,
    group: "OAuth · tsidp",
    label: "Enable tsidp",
    description: "Enable the tsidp OAuth provider.",
  },
  {
    key: "oauth.providers.tsidp.clientId",
    schema: z.string(),
    defaultValue: "",
    effect: "restartRequired",
    secret: false,
    group: "OAuth · tsidp",
    label: "Client ID",
    description: "OAuth client ID for tsidp.",
  },
  {
    key: "oauth.providers.tsidp.clientSecret",
    schema: z.string(),
    defaultValue: "",
    effect: "restartRequired",
    secret: true,
    group: "OAuth · tsidp",
    label: "Client secret",
    description: "OAuth client secret for tsidp.",
  },
  {
    key: "oauth.providers.tsidp.issuer",
    schema: optionalUrlSchema,
    defaultValue: "",
    effect: "restartRequired",
    secret: false,
    group: "OAuth · tsidp",
    label: "Issuer URL",
    description: "OpenID Connect issuer URL for tsidp.",
  },
  {
    key: "oauth.providers.tsidp.scopes",
    schema: z.string(),
    defaultValue: "openid profile email",
    effect: "restartRequired",
    secret: false,
    group: "OAuth · tsidp",
    label: "Scopes",
    description: "OAuth scopes requested from tsidp.",
  },
  {
    key: "oauth.providers.strava.enabled",
    schema: z.boolean(),
    defaultValue: false,
    effect: "restartRequired",
    secret: false,
    group: "OAuth · Strava",
    label: "Enable Strava",
    description: "Enable the Strava OAuth provider.",
  },
  {
    key: "oauth.providers.strava.clientId",
    schema: z.string(),
    defaultValue: "",
    effect: "restartRequired",
    secret: false,
    group: "OAuth · Strava",
    label: "Client ID",
    description: "OAuth client ID for Strava.",
  },
  {
    key: "oauth.providers.strava.clientSecret",
    schema: z.string(),
    defaultValue: "",
    effect: "restartRequired",
    secret: true,
    group: "OAuth · Strava",
    label: "Client secret",
    description: "OAuth client secret for Strava.",
  },
  {
    key: "oauth.providers.strava.scopes",
    schema: z.string(),
    defaultValue: "read,activity:read_all,profile:read_all",
    effect: "restartRequired",
    secret: false,
    group: "OAuth · Strava",
    label: "Scopes",
    description: "OAuth scopes requested from Strava.",
  },
  {
    key: "integration.strava.enabled",
    schema: z.boolean(),
    defaultValue: false,
    effect: "restartRequired",
    secret: false,
    group: "Integration · Strava",
    label: "Enable Strava integration",
    description: "Enable syncing activities from Strava.",
  },
  {
    key: "integration.strava.inheritCredentials",
    schema: z.boolean(),
    defaultValue: true,
    effect: "restartRequired",
    secret: false,
    group: "Integration · Strava",
    label: "Use OAuth credentials",
    description: "Use credentials configured for the Strava OAuth provider.",
  },
  {
    key: "integration.strava.clientId",
    schema: z.string(),
    defaultValue: "",
    effect: "restartRequired",
    secret: false,
    inheritWhen: "integration.strava.inheritCredentials",
    inheritFrom: "oauth.providers.strava.clientId",
    group: "Integration · Strava",
    label: "Client ID",
    description: "Strava API client ID.",
  },
  {
    key: "integration.strava.clientSecret",
    schema: z.string(),
    defaultValue: "",
    effect: "restartRequired",
    secret: true,
    inheritWhen: "integration.strava.inheritCredentials",
    inheritFrom: "oauth.providers.strava.clientSecret",
    group: "Integration · Strava",
    label: "Client secret",
    description: "Strava API client secret.",
  },
  {
    key: "integration.strava.redirectUri",
    schema: optionalUrlSchema,
    defaultValue: "http://localhost:3001/api/strava/callback",
    effect: "restartRequired",
    secret: false,
    group: "Integration · Strava",
    label: "Redirect URI",
    description: "Callback URL registered with Strava.",
  },
  {
    key: "integration.strava.scopes",
    schema: z.string(),
    defaultValue: "read,activity:read_all,profile:read_all",
    effect: "restartRequired",
    secret: false,
    group: "Integration · Strava",
    label: "Scopes",
    description: "Strava API scopes used for activity sync.",
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
