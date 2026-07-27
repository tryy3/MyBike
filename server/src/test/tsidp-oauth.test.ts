import { describe, expect, it } from "vite-plus/test";
import {
  buildTsidpOAuthConfig,
  isTsidpOAuthConfigured,
  resolveTsidpScopes,
  TSIDP_PROVIDER_ID,
} from "../lib/tsidp-oauth.js";

describe("tsidp oauth", () => {
  it("detects when tsidp credentials are configured", () => {
    expect(
      isTsidpOAuthConfigured({
        TSIDP_CLIENT_ID: undefined,
        TSIDP_CLIENT_SECRET: undefined,
        TSIDP_ISSUER: undefined,
      }),
    ).toBe(false);

    expect(
      isTsidpOAuthConfigured({
        TSIDP_CLIENT_ID: "client",
        TSIDP_CLIENT_SECRET: "secret",
        TSIDP_ISSUER: "https://idp.example.ts.net",
      }),
    ).toBe(true);

    expect(
      isTsidpOAuthConfigured({
        TSIDP_CLIENT_ID: "client",
        TSIDP_CLIENT_SECRET: "secret",
      }),
    ).toBe(false);
  });

  it("builds an OIDC discovery-based generic OAuth config", () => {
    const config = buildTsidpOAuthConfig({
      TSIDP_CLIENT_ID: "client",
      TSIDP_CLIENT_SECRET: "secret",
      TSIDP_ISSUER: "https://idp.example.ts.net/",
    });

    expect(config.providerId).toBe(TSIDP_PROVIDER_ID);
    expect(config.name).toBe("Tailscale");
    expect(config.discoveryUrl).toBe("https://idp.example.ts.net/.well-known/openid-configuration");
    expect(config.accountIssuer).toBe("https://idp.example.ts.net");
    expect(config.pkce).toBe(true);
    expect(config.scopes).toEqual(["openid", "profile", "email"]);
  });

  it("parses custom scopes from env", () => {
    expect(resolveTsidpScopes({ TSIDP_SCOPES: "openid, email  profile" })).toEqual([
      "openid",
      "email",
      "profile",
    ]);
  });

  it("rejects an invalid issuer URL", () => {
    expect(() =>
      buildTsidpOAuthConfig({
        TSIDP_CLIENT_ID: "client",
        TSIDP_CLIENT_SECRET: "secret",
        TSIDP_ISSUER: "not-a-url",
      }),
    ).toThrow("TSIDP_ISSUER");
  });
});
