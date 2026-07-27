import { describe, expect, it } from "vite-plus/test";
import request from "supertest";
import { createApp } from "../app.js";
import {
  buildConfiguredOAuthProviders,
  resolveOAuthProviderFlags,
} from "../lib/oauth-providers.js";

const ENV_KEYS = [
  "STRAVA_CLIENT_ID",
  "STRAVA_CLIENT_SECRET",
  "TSIDP_CLIENT_ID",
  "TSIDP_CLIENT_SECRET",
  "TSIDP_ISSUER",
] as const;

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreEnv(snapshot: ReturnType<typeof snapshotEnv>) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearOAuthEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

const app = createApp();

describe("oauth providers", () => {
  it("reports no providers when env is empty", () => {
    const original = snapshotEnv();
    clearOAuthEnv();

    try {
      expect(resolveOAuthProviderFlags()).toEqual({ strava: false, tsidp: false });
      expect(buildConfiguredOAuthProviders()).toEqual([]);
    } finally {
      restoreEnv(original);
    }
  });

  it("can enable strava and tsidp together", () => {
    const original = snapshotEnv();
    clearOAuthEnv();

    process.env.STRAVA_CLIENT_ID = "strava-client";
    process.env.STRAVA_CLIENT_SECRET = "strava-secret";
    process.env.TSIDP_CLIENT_ID = "tsidp-client";
    process.env.TSIDP_CLIENT_SECRET = "tsidp-secret";
    process.env.TSIDP_ISSUER = "https://idp.example.ts.net";

    try {
      expect(resolveOAuthProviderFlags()).toEqual({ strava: true, tsidp: true });
      const providers = buildConfiguredOAuthProviders();
      expect(providers.map((p) => p.providerId)).toEqual(["strava", "tsidp"]);
    } finally {
      restoreEnv(original);
    }
  });

  it("exposes provider flags on GET /api/oauth/config without auth", async () => {
    const original = snapshotEnv();
    clearOAuthEnv();
    process.env.TSIDP_CLIENT_ID = "tsidp-client";
    process.env.TSIDP_CLIENT_SECRET = "tsidp-secret";
    process.env.TSIDP_ISSUER = "https://idp.example.ts.net";

    try {
      const res = await request(app).get("/api/oauth/config").expect(200);
      expect(res.body).toEqual({
        providers: { strava: false, tsidp: true },
      });
    } finally {
      restoreEnv(original);
    }
  });
});
