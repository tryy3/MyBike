export const APP_SETTING_KEYS = [
  "logging.level",
  "graphql.timing",
  "strava.webhook.pollIntervalMs",
  "strava.webhook.proxyApiKey",
  "logging.toFile",
  "betterAuth.baseUrl",
  "client.url",
] as const;
export type AppSettingKey = (typeof APP_SETTING_KEYS)[number];

export const SETTING_VALUE_SOURCES = ["env", "database", "default"] as const;
export type SettingValueSource = (typeof SETTING_VALUE_SOURCES)[number];

export const SETTING_EFFECTS = ["hotReload", "restartRequired"] as const;
export type SettingEffect = (typeof SETTING_EFFECTS)[number];
