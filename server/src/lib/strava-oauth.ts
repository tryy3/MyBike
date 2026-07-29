import type { GenericOAuthConfig } from "better-auth/plugins";
import { getLoadedAppConfigValue } from "../services/app-config.js";
import {
  STRAVA_ACCOUNT_ISSUER,
  STRAVA_PROVIDER_ID,
  exchangeStravaCode,
  stravaAthleteDisplayName,
  stravaPlaceholderEmail,
  type StravaAthleteProfile,
  type StravaTokenResponse,
} from "./strava-client.js";

const DEFAULT_STRAVA_SCOPES = "read,activity:read_all,profile:read_all";
const STRAVA_ACCESS_TOKEN_TTL_SECONDS = 6 * 60 * 60;

function stravaClientId(): string | undefined {
  return getLoadedAppConfigValue<string>("oauth.providers.strava.clientId")?.trim() || undefined;
}

function stravaClientSecret(): string | undefined {
  return (
    getLoadedAppConfigValue<string>("oauth.providers.strava.clientSecret")?.trim() || undefined
  );
}

function resolveStravaAuthScopes(): string {
  return (
    getLoadedAppConfigValue<string>("oauth.providers.strava.scopes")?.trim() ||
    DEFAULT_STRAVA_SCOPES
  );
}

function readStravaToken(raw: Record<string, unknown> | undefined): StravaTokenResponse | null {
  if (!raw || typeof raw.athleteId !== "string") {
    return null;
  }

  const athlete = raw.athlete as StravaAthleteProfile | undefined;
  if (
    !athlete ||
    typeof raw.accessToken !== "string" ||
    typeof raw.refreshToken !== "string" ||
    typeof raw.expiresAtMs !== "number"
  ) {
    return null;
  }

  return {
    athleteId: raw.athleteId,
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken,
    expiresAtMs: raw.expiresAtMs,
    scope: typeof raw.scope === "string" ? raw.scope : undefined,
    athlete,
  };
}

export function isStravaOAuthConfigured(): boolean {
  if (!getLoadedAppConfigValue<boolean>("oauth.providers.strava.enabled")) {
    return false;
  }
  return Boolean(stravaClientId() && stravaClientSecret());
}

export function buildStravaOAuthConfig(): GenericOAuthConfig {
  const clientId = stravaClientId();
  const clientSecret = stravaClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Strava OAuth requires oauth.providers.strava.clientId and clientSecret to be configured",
    );
  }

  return {
    providerId: STRAVA_PROVIDER_ID,
    name: "Strava",
    accountIssuer: STRAVA_ACCOUNT_ISSUER,
    authorizationUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    clientId,
    clientSecret,
    pkce: false,
    scopes: [],
    authorizationUrlParams: {
      approval_prompt: "auto",
      scope: resolveStravaAuthScopes(),
    },
    accessTokenExpiresIn: STRAVA_ACCESS_TOKEN_TTL_SECONDS,
    getToken: async ({ code }) => {
      // Pass credentials explicitly so login always uses oauth.providers.strava.*
      // config, independent of integration.strava.* used by the /api/strava sync
      // path (see exchangeStravaCode() / requireIntegrationCredentials()).
      const token = await exchangeStravaCode(code, { clientId, clientSecret });
      return {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        accessTokenExpiresAt: new Date(token.expiresAtMs),
        scopes:
          token.scope
            ?.split(",")
            .map((scope) => scope.trim())
            .filter(Boolean) ?? [],
        raw: { ...token },
      };
    },
    getUserInfo: async (tokens) => {
      const token = readStravaToken(tokens.raw);
      const athlete = token?.athlete;
      if (!athlete) return null;

      const email = athlete.email ?? stravaPlaceholderEmail(athlete.id);
      return {
        id: athlete.id,
        name: stravaAthleteDisplayName(athlete),
        email,
        emailVerified: Boolean(athlete.email),
        image: athlete.profile ?? athlete.profileMedium,
      };
    },
    mapProfileToUser: (profile) => {
      const athleteId = profile.id ?? profile.sub;
      if (athleteId === undefined || athleteId === null || athleteId === "") {
        return {};
      }

      const email =
        typeof profile.email === "string" && profile.email.length > 0
          ? profile.email
          : stravaPlaceholderEmail(String(athleteId));

      return {
        email,
        emailVerified: profile.emailVerified === true,
        name: typeof profile.name === "string" ? profile.name : undefined,
        image: typeof profile.image === "string" ? profile.image : undefined,
      };
    },
  };
}
