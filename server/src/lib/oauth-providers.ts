import type { GenericOAuthConfig } from "better-auth/plugins";
import { buildStravaOAuthConfig, isStravaOAuthConfigured } from "./strava-oauth.js";
import { buildTsidpOAuthConfig, isTsidpOAuthConfigured } from "./tsidp-oauth.js";

export interface OAuthProviderFlags {
  strava: boolean;
  tsidp: boolean;
}

/** Which social/OIDC login providers are configured via env. */
export function resolveOAuthProviderFlags(): OAuthProviderFlags {
  return {
    strava: isStravaOAuthConfigured(),
    tsidp: isTsidpOAuthConfigured(),
  };
}

/** Build Better Auth genericOAuth configs for every configured provider. */
export function buildConfiguredOAuthProviders(): GenericOAuthConfig[] {
  const providers: GenericOAuthConfig[] = [];
  if (isStravaOAuthConfigured()) {
    providers.push(buildStravaOAuthConfig());
  }
  if (isTsidpOAuthConfigured()) {
    providers.push(buildTsidpOAuthConfig());
  }
  return providers;
}
