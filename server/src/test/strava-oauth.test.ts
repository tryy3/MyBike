import { describe, expect, it } from "vite-plus/test";
import { stravaAthleteDisplayName, stravaPlaceholderEmail } from "../lib/strava-client.js";
import { buildStravaOAuthConfig, isStravaOAuthConfigured } from "../lib/strava-oauth.js";

describe("strava oauth", () => {
  it("detects when Strava credentials are configured", () => {
    const originalClientId = process.env.STRAVA_CLIENT_ID;
    const originalClientSecret = process.env.STRAVA_CLIENT_SECRET;

    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.STRAVA_CLIENT_SECRET;
    expect(isStravaOAuthConfigured()).toBe(false);

    process.env.STRAVA_CLIENT_ID = "test-client";
    process.env.STRAVA_CLIENT_SECRET = "test-secret";
    expect(isStravaOAuthConfigured()).toBe(true);

    process.env.STRAVA_CLIENT_ID = originalClientId;
    process.env.STRAVA_CLIENT_SECRET = originalClientSecret;
  });

  it("builds a Strava generic OAuth provider config", () => {
    const originalClientId = process.env.STRAVA_CLIENT_ID;
    const originalClientSecret = process.env.STRAVA_CLIENT_SECRET;

    process.env.STRAVA_CLIENT_ID = "test-client";
    process.env.STRAVA_CLIENT_SECRET = "test-secret";

    const config = buildStravaOAuthConfig();
    expect(config.providerId).toBe("strava");
    expect(config.pkce).toBe(false);
    expect(config.authorizationUrlParams?.scope).toContain("activity:read_all");

    process.env.STRAVA_CLIENT_ID = originalClientId;
    process.env.STRAVA_CLIENT_SECRET = originalClientSecret;
  });

  it("maps athlete profile fields for auth", async () => {
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
