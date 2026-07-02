import { describe, expect, it } from "vite-plus/test";
import { DEV_AUTH_SECRET, resolveAuthConfig } from "../lib/auth-config.js";

describe("resolveAuthConfig", () => {
  it("allows local development defaults", () => {
    const config = resolveAuthConfig({});

    expect(config).toMatchObject({
      secret: DEV_AUTH_SECRET,
      baseURL: "http://localhost:3001",
      clientURL: "http://localhost:5173",
    });
  });

  it("requires an explicit secret for production", () => {
    expect(() =>
      resolveAuthConfig({
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://api.example.com",
        CLIENT_URL: "https://app.example.com",
      }),
    ).toThrow("BETTER_AUTH_SECRET");
  });

  it("treats public URLs as production-like even without NODE_ENV", () => {
    expect(() =>
      resolveAuthConfig({
        BETTER_AUTH_URL: "https://api.example.com",
        CLIENT_URL: "https://app.example.com",
      }),
    ).toThrow("BETTER_AUTH_SECRET");
  });

  it("requires https for public auth URLs", () => {
    expect(() =>
      resolveAuthConfig({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "a".repeat(32),
        BETTER_AUTH_URL: "http://api.example.com",
        CLIENT_URL: "https://app.example.com",
      }),
    ).toThrow("BETTER_AUTH_URL");
  });
});
