import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import request from "supertest";
import { createApp } from "../app.js";
import { db } from "../db/index.js";
import {
  buildConfiguredOAuthProviders,
  resolveOAuthProviderFlags,
} from "../lib/oauth-providers.js";
import { appConfig } from "../services/app-config.js";

const app = createApp();

// oauth.providers.* settings are restart-required, so `appConfig.get()` only
// reflects them from the boot-time snapshot; reload after writing to mimic a
// restart picking up the new values.
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

describe("oauth providers", () => {
  it("reports no providers when config is empty", () => {
    expect(resolveOAuthProviderFlags()).toEqual({ strava: false, tsidp: false });
    expect(buildConfiguredOAuthProviders()).toEqual([]);
  });

  it("can enable strava and tsidp together", async () => {
    await setConfig({
      "oauth.providers.strava.enabled": true,
      "oauth.providers.strava.clientId": "strava-client",
      "oauth.providers.strava.clientSecret": "strava-secret",
      "oauth.providers.tsidp.enabled": true,
      "oauth.providers.tsidp.clientId": "tsidp-client",
      "oauth.providers.tsidp.clientSecret": "tsidp-secret",
      "oauth.providers.tsidp.issuer": "https://idp.example.ts.net",
    });

    expect(resolveOAuthProviderFlags()).toEqual({ strava: true, tsidp: true });
    const providers = buildConfiguredOAuthProviders();
    expect(providers.map((p) => p.providerId)).toEqual(["strava", "tsidp"]);
  });

  it("gates on enabled=true even when full credentials are present", async () => {
    await setConfig({
      "oauth.providers.tsidp.enabled": false,
      "oauth.providers.tsidp.clientId": "tsidp-client",
      "oauth.providers.tsidp.clientSecret": "tsidp-secret",
      "oauth.providers.tsidp.issuer": "https://idp.example.ts.net",
      "oauth.providers.strava.enabled": false,
      "oauth.providers.strava.clientId": "strava-client",
      "oauth.providers.strava.clientSecret": "strava-secret",
    });

    expect(resolveOAuthProviderFlags()).toEqual({ strava: false, tsidp: false });
    expect(buildConfiguredOAuthProviders()).toEqual([]);
  });

  it("exposes provider flags on GET /api/oauth/config without auth", async () => {
    await setConfig({
      "oauth.providers.tsidp.enabled": true,
      "oauth.providers.tsidp.clientId": "tsidp-client",
      "oauth.providers.tsidp.clientSecret": "tsidp-secret",
      "oauth.providers.tsidp.issuer": "https://idp.example.ts.net",
    });

    const res = await request(app).get("/api/oauth/config").expect(200);
    expect(res.body).toEqual({
      providers: { strava: false, tsidp: true },
    });
  });
});
