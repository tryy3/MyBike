export const APP_SETTING_KEYS = [
  "server.port",
  "logging.level",
  "logging.toFile",
  "logging.filePath",
  "logging.redact",
  "graphql.timing",
  "strava.webhook.pollIntervalMs",
  "strava.webhook.proxyApiKey",
  "strava.webhook.proxyUrl",
  "strava.webhook.subscriptionId",
  "betterAuth.baseUrl",
  "client.url",
  "oauth.providers.tsidp.enabled",
  "oauth.providers.tsidp.clientId",
  "oauth.providers.tsidp.clientSecret",
  "oauth.providers.tsidp.issuer",
  "oauth.providers.tsidp.scopes",
  "oauth.providers.strava.enabled",
  "oauth.providers.strava.clientId",
  "oauth.providers.strava.clientSecret",
  "oauth.providers.strava.scopes",
  "integration.strava.enabled",
  "integration.strava.inheritCredentials",
  "integration.strava.clientId",
  "integration.strava.clientSecret",
  "integration.strava.redirectUri",
  "integration.strava.scopes",
] as const;
export type AppSettingKey = (typeof APP_SETTING_KEYS)[number];

export const SETTING_VALUE_SOURCES = ["database", "default", "inherited"] as const;
export type SettingValueSource = (typeof SETTING_VALUE_SOURCES)[number];

export const SETTING_EFFECTS = ["hotReload", "restartRequired"] as const;
export type SettingEffect = (typeof SETTING_EFFECTS)[number];
