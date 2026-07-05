import type { GenericOAuthConfig } from "better-auth/plugins";
import {
  STRAVA_PROVIDER_ID,
  exchangeStravaCode,
  stravaAthleteDisplayName,
  stravaPlaceholderEmail,
  type StravaAthleteProfile,
  type StravaTokenResponse,
} from "./strava-client.js";

const STRAVA_AUTH_SCOPES = process.env.STRAVA_SCOPES ?? "read,activity:read_all,profile:read_all";
const STRAVA_ACCESS_TOKEN_TTL_SECONDS = 6 * 60 * 60;

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
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

export function buildStravaOAuthConfig(): GenericOAuthConfig {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Strava OAuth requires STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET");
  }

  return {
    providerId: STRAVA_PROVIDER_ID,
    name: "Strava",
    authorizationUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    clientId,
    clientSecret,
    pkce: false,
    scopes: [],
    authorizationUrlParams: {
      approval_prompt: "auto",
      scope: STRAVA_AUTH_SCOPES,
    },
    accessTokenExpiresIn: STRAVA_ACCESS_TOKEN_TTL_SECONDS,
    getToken: async ({ code }) => {
      const token = await exchangeStravaCode(code);
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
