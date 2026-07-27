import type { GenericOAuthConfig } from "better-auth/plugins";

export const TSIDP_PROVIDER_ID = "tsidp";

const DEFAULT_SCOPES = ["openid", "profile", "email"] as const;

interface TsidpEnv {
  TSIDP_CLIENT_ID?: string;
  TSIDP_CLIENT_SECRET?: string;
  TSIDP_ISSUER?: string;
  TSIDP_SCOPES?: string;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function isTsidpOAuthConfigured(env: TsidpEnv = process.env): boolean {
  return Boolean(env.TSIDP_CLIENT_ID && env.TSIDP_CLIENT_SECRET && env.TSIDP_ISSUER);
}

export function resolveTsidpScopes(env: TsidpEnv = process.env): string[] {
  const raw = env.TSIDP_SCOPES?.trim();
  if (!raw) {
    return [...DEFAULT_SCOPES];
  }
  return raw
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function buildTsidpOAuthConfig(env: TsidpEnv = process.env): GenericOAuthConfig {
  const clientId = env.TSIDP_CLIENT_ID;
  const clientSecret = env.TSIDP_CLIENT_SECRET;
  const issuerRaw = env.TSIDP_ISSUER;
  if (!clientId || !clientSecret || !issuerRaw) {
    throw new Error("tsidp OAuth requires TSIDP_CLIENT_ID, TSIDP_CLIENT_SECRET, and TSIDP_ISSUER");
  }

  const issuer = trimTrailingSlash(issuerRaw);
  let discoveryOrigin: URL;
  try {
    discoveryOrigin = new URL(issuer);
  } catch {
    throw new Error("TSIDP_ISSUER must be a valid absolute URL");
  }
  if (discoveryOrigin.protocol !== "https:" && discoveryOrigin.protocol !== "http:") {
    throw new Error("TSIDP_ISSUER must use http:// or https://");
  }

  return {
    providerId: TSIDP_PROVIDER_ID,
    name: "Tailscale",
    clientId,
    clientSecret,
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    // Stable account namespace if discovery is briefly unavailable at startup.
    accountIssuer: issuer,
    pkce: true,
    scopes: resolveTsidpScopes(env),
  };
}
