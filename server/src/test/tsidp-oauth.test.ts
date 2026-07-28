import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "../db/index.js";
import {
  buildTsidpOAuthConfig,
  isTsidpOAuthConfigured,
  resolveTsidpScopes,
  TSIDP_PROVIDER_ID,
} from "../lib/tsidp-oauth.js";
import { appConfig } from "../services/app-config.js";

async function resetConfigState() {
  await db.run(sql`DELETE FROM app_settings`);
  await appConfig.load();
}

// oauth.providers.tsidp.* settings are restart-required, so `appConfig.get()`
// only reflects them from the boot-time snapshot; reload after writing to
// mimic a restart picking up the new values.
async function setTsidpConfig(overrides: Record<string, unknown>) {
  await appConfig.setMany(
    Object.entries(overrides).map(([key, value]) => ({ key, value })),
    null,
  );
  await appConfig.load();
}

beforeEach(async () => {
  await resetConfigState();
});

describe("tsidp oauth", () => {
  it("is not configured when disabled even with full credentials", async () => {
    await setTsidpConfig({
      "oauth.providers.tsidp.enabled": false,
      "oauth.providers.tsidp.clientId": "client",
      "oauth.providers.tsidp.clientSecret": "secret",
      "oauth.providers.tsidp.issuer": "https://idp.example.ts.net",
    });

    expect(isTsidpOAuthConfigured()).toBe(false);
  });

  it("is not configured when enabled but credentials are missing", async () => {
    await setTsidpConfig({ "oauth.providers.tsidp.enabled": true });

    expect(isTsidpOAuthConfigured()).toBe(false);
  });

  it("is configured when enabled with full credentials", async () => {
    await setTsidpConfig({
      "oauth.providers.tsidp.enabled": true,
      "oauth.providers.tsidp.clientId": "client",
      "oauth.providers.tsidp.clientSecret": "secret",
      "oauth.providers.tsidp.issuer": "https://idp.example.ts.net",
    });

    expect(isTsidpOAuthConfigured()).toBe(true);
  });

  it("is not configured when enabled but only some credentials are set", async () => {
    await setTsidpConfig({
      "oauth.providers.tsidp.enabled": true,
      "oauth.providers.tsidp.clientId": "client",
      "oauth.providers.tsidp.clientSecret": "secret",
    });

    expect(isTsidpOAuthConfigured()).toBe(false);
  });

  it("builds an OIDC discovery-based generic OAuth config", async () => {
    await setTsidpConfig({
      "oauth.providers.tsidp.enabled": true,
      "oauth.providers.tsidp.clientId": "client",
      "oauth.providers.tsidp.clientSecret": "secret",
      "oauth.providers.tsidp.issuer": "https://idp.example.ts.net/",
    });

    const config = buildTsidpOAuthConfig();

    expect(config.providerId).toBe(TSIDP_PROVIDER_ID);
    expect(config.name).toBe("Tailscale");
    expect(config.discoveryUrl).toBe("https://idp.example.ts.net/.well-known/openid-configuration");
    expect(config.accountIssuer).toBe("https://idp.example.ts.net");
    expect(config.pkce).toBe(true);
    expect(config.scopes).toEqual(["openid", "profile", "email"]);
  });

  it("parses custom scopes from config", async () => {
    await setTsidpConfig({ "oauth.providers.tsidp.scopes": "openid, email  profile" });

    expect(resolveTsidpScopes()).toEqual(["openid", "email", "profile"]);
  });

  it("falls back to default scopes when config is blank", async () => {
    await setTsidpConfig({ "oauth.providers.tsidp.scopes": "" });

    expect(resolveTsidpScopes()).toEqual(["openid", "profile", "email"]);
  });

  it("throws a config-referencing error when credentials are missing", async () => {
    expect(() => buildTsidpOAuthConfig()).toThrow("oauth.providers.tsidp");
  });
});
