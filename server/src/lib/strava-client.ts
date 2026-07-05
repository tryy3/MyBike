import { HttpError } from "./errors.js";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";
const MAX_ACTIVITY_PAGES = 10;

export interface StravaActivity {
  stravaActivityId: string;
  gearId: string | null;
  gearName: string | null;
  distanceMeters: number;
  movingTimeMinutes: number;
  startDate: string;
}

export interface StravaTokenResponse {
  athleteId: string;
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  scope?: string;
}

interface RawStravaActivity {
  id?: unknown;
  gear_id?: unknown;
  gear?: {
    id?: unknown;
    name?: unknown;
  } | null;
  distance?: unknown;
  moving_time?: unknown;
  start_date?: unknown;
}

function requireStravaCredentials() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new HttpError(501, "Strava is not configured");
  }
  return { clientId, clientSecret };
}

function normalizeActivity(raw: RawStravaActivity): StravaActivity | null {
  const activityId =
    typeof raw.id === "string" || typeof raw.id === "number" ? String(raw.id) : null;
  const startDate = typeof raw.start_date === "string" ? raw.start_date : null;
  if (!activityId || !startDate) return null;
  const distance = Number(raw.distance ?? 0);
  const movingTimeSeconds = Number(raw.moving_time ?? 0);
  if (!Number.isFinite(distance) || !Number.isFinite(movingTimeSeconds)) return null;

  const gearId =
    typeof raw.gear_id === "string"
      ? raw.gear_id
      : typeof raw.gear?.id === "string"
        ? raw.gear.id
        : null;
  const gearName = typeof raw.gear?.name === "string" ? raw.gear.name : null;

  return {
    stravaActivityId: activityId,
    gearId,
    gearName,
    distanceMeters: Math.max(0, Math.round(distance)),
    movingTimeMinutes: Math.max(0, Math.round(movingTimeSeconds / 60)),
    startDate,
  };
}

async function fetchJson(url: URL | string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ?? detail;
    } catch {
      // Keep status text if Strava did not return JSON.
    }
    throw new HttpError(res.status === 401 ? 401 : 502, `Strava request failed: ${detail}`);
  }
  return res.json();
}

export async function fetchStravaActivities(accessToken: string): Promise<StravaActivity[]> {
  const activities: StravaActivity[] = [];

  for (let page = 1; page <= MAX_ACTIVITY_PAGES; page++) {
    const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
    url.searchParams.set("per_page", "200");
    url.searchParams.set("page", String(page));

    const raw = await fetchJson(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!Array.isArray(raw) || raw.length === 0) break;

    for (const item of raw) {
      const activity = normalizeActivity(item as RawStravaActivity);
      if (activity) activities.push(activity);
    }
  }

  return activities;
}

export function buildStravaAuthorizationUrl(state: string): string {
  const { clientId } = requireStravaCredentials();
  const redirectUri =
    process.env.STRAVA_REDIRECT_URI ?? "http://localhost:3001/api/strava/callback";
  const scopes = process.env.STRAVA_SCOPES ?? "read,activity:read_all";
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  return url.toString();
}

function parseTokenResponse(raw: unknown, fallbackScope?: string): StravaTokenResponse {
  const data = raw as Record<string, unknown>;
  const athlete = data.athlete as Record<string, unknown> | undefined;
  if (
    !athlete ||
    (typeof athlete.id !== "string" && typeof athlete.id !== "number") ||
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    typeof data.expires_at !== "number"
  ) {
    throw new HttpError(502, "Strava returned an invalid OAuth response");
  }
  return {
    athleteId: String(athlete.id),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAtMs: data.expires_at * 1000,
    scope: typeof data.scope === "string" ? data.scope : fallbackScope,
  };
}

export async function exchangeStravaCode(code: string): Promise<StravaTokenResponse> {
  const { clientId, clientSecret } = requireStravaCredentials();
  const raw = await fetchJson(STRAVA_OAUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  return parseTokenResponse(raw);
}

export async function refreshStravaAccessToken(
  refreshToken: string,
  scope?: string | null,
): Promise<StravaTokenResponse> {
  const { clientId, clientSecret } = requireStravaCredentials();
  const raw = await fetchJson(STRAVA_OAUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  return parseTokenResponse(raw, scope ?? undefined);
}
