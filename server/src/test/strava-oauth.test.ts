import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "../db/index.js";
import { stravaAthleteDisplayName, stravaPlaceholderEmail } from "../lib/strava-client.js";
import { buildStravaOAuthConfig, isStravaOAuthConfigured } from "../lib/strava-oauth.js";
import { appConfig } from "../services/app-config.js";

// oauth.providers.strava.* settings are restart-required, so `appConfig.get()`
// only reflects them from the boot-time snapshot; reload after writing to
// mimic a restart picking up the new values.
async function setConfig(overrides: Record<string, unknown>) {
  await appConfig.setMany(
    Object.entries(overrides).map(([key, value]) => ({ key, value })),
    null,
  );
  await appConfig.load();
}

beforeEach(async () => {
  await db.run(sql`DELETE FROM app_settings`);
  await appConfig.load();
});

describe("strava oauth", () => {
  it("detects when Strava credentials are configured", async () => {
    expect(isStravaOAuthConfigured()).toBe(false);

    await setConfig({
      "oauth.providers.strava.enabled": true,
      "oauth.providers.strava.clientId": "test-client",
      "oauth.providers.strava.clientSecret": "test-secret",
    });
    expect(isStravaOAuthConfigured()).toBe(true);
  });

  it("is not configured when disabled even with full credentials", async () => {
    await setConfig({
      "oauth.providers.strava.enabled": false,
      "oauth.providers.strava.clientId": "test-client",
      "oauth.providers.strava.clientSecret": "test-secret",
    });

    expect(isStravaOAuthConfigured()).toBe(false);
  });

  it("builds a Strava generic OAuth provider config", async () => {
    await setConfig({
      "oauth.providers.strava.enabled": true,
      "oauth.providers.strava.clientId": "test-client",
      "oauth.providers.strava.clientSecret": "test-secret",
    });

    const config = buildStravaOAuthConfig();
    expect(config.providerId).toBe("strava");
    expect(config.pkce).toBe(false);
    expect(config.authorizationUrlParams?.scope).toContain("activity:read_all");
  });

  it("uses custom scopes from config", async () => {
    await setConfig({
      "oauth.providers.strava.enabled": true,
      "oauth.providers.strava.clientId": "test-client",
      "oauth.providers.strava.clientSecret": "test-secret",
      "oauth.providers.strava.scopes": "read,profile:read_all",
    });

    const config = buildStravaOAuthConfig();
    expect(config.authorizationUrlParams?.scope).toBe("read,profile:read_all");
  });

  it("throws a config-referencing error when credentials are missing", () => {
    expect(() => buildStravaOAuthConfig()).toThrow("oauth.providers.strava");
  });

  it("maps athlete profile fields for auth", async () => {
    await setConfig({
      "oauth.providers.strava.enabled": true,
      "oauth.providers.strava.clientId": "test-client",
      "oauth.providers.strava.clientSecret": "test-secret",
    });

    expect(stravaPlaceholderEmail("12345")).toBe("strava+12345@strava.users.mybike");
    expect(
      stravaAthleteDisplayName({
        id: "12345",
        firstname: "Ada",
        lastname: "Lovelace",
      }),
    ).toBe("Ada Lovelace");

    const config = buildStravaOAuthConfig();
    const profile = await config.getUserInfo?.({
      accessToken: "token",
      raw: {
        athleteId: "12345",
        accessToken: "token",
        refreshToken: "refresh",
        expiresAtMs: Date.now() + 60_000,
        athlete: {
          id: "12345",
          firstname: "Ada",
          lastname: "Lovelace",
          profile: "https://example.com/avatar.jpg",
        },
      },
    });

    expect(profile).toMatchObject({
      id: "12345",
      name: "Ada Lovelace",
      email: "strava+12345@strava.users.mybike",
      image: "https://example.com/avatar.jpg",
    });
  });
});
