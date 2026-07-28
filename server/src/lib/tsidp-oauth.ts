import type { GenericOAuthConfig } from "better-auth/plugins";
import { getLoadedAppConfigValue } from "../services/app-config.js";

export const TSIDP_PROVIDER_ID = "tsidp";

const DEFAULT_SCOPES = ["openid", "profile", "email"] as const;

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function tsidpClientId(): string | undefined {
  return getLoadedAppConfigValue<string>("oauth.providers.tsidp.clientId")?.trim() || undefined;
}

function tsidpClientSecret(): string | undefined {
  return getLoadedAppConfigValue<string>("oauth.providers.tsidp.clientSecret")?.trim() || undefined;
}

function tsidpIssuer(): string | undefined {
  return getLoadedAppConfigValue<string>("oauth.providers.tsidp.issuer")?.trim() || undefined;
}

export function isTsidpOAuthConfigured(): boolean {
  if (!getLoadedAppConfigValue<boolean>("oauth.providers.tsidp.enabled")) {
    return false;
  }
  return Boolean(tsidpClientId() && tsidpClientSecret() && tsidpIssuer());
}

export function resolveTsidpScopes(): string[] {
  const raw = getLoadedAppConfigValue<string>("oauth.providers.tsidp.scopes")?.trim();
  if (!raw) {
    return [...DEFAULT_SCOPES];
  }
  return raw
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function buildTsidpOAuthConfig(): GenericOAuthConfig {
  const clientId = tsidpClientId();
  const clientSecret = tsidpClientSecret();
  const issuerRaw = tsidpIssuer();
  if (!clientId || !clientSecret || !issuerRaw) {
    throw new Error(
      "tsidp OAuth requires oauth.providers.tsidp.clientId, clientSecret, and issuer to be configured",
    );
  }

  const issuer = trimTrailingSlash(issuerRaw);
  let discoveryOrigin: URL;
  try {
    discoveryOrigin = new URL(issuer);
  } catch {
    throw new Error("oauth.providers.tsidp.issuer must be a valid absolute URL");
  }
  if (discoveryOrigin.protocol !== "https:" && discoveryOrigin.protocol !== "http:") {
    throw new Error("oauth.providers.tsidp.issuer must use http:// or https://");
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
    scopes: resolveTsidpScopes(),
  };
}
