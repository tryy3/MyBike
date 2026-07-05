import { HttpError } from "./errors.js";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";
const MAX_ACTIVITY_PAGES = 10;
const ACTIVITIES_PER_PAGE = 200;

export interface StravaActivity {
  stravaActivityId: string;
  gearId: string | null;
  gearName: string | null;
  distanceMeters: number;
  movingTimeMinutes: number;
  startDate: string;
}

export interface StravaAthleteProfile {
  id: string;
  firstname?: string;
  lastname?: string;
  username?: string;
  profile?: string;
  profileMedium?: string;
  email?: string;
}

export interface StravaTokenResponse {
  athleteId: string;
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  scope?: string;
  athlete?: StravaAthleteProfile;
}

export const STRAVA_PROVIDER_ID = "strava";

export function stravaPlaceholderEmail(athleteId: string): string {
  return `strava+${athleteId}@strava.users.mybike`;
}

export function stravaAthleteDisplayName(athlete: StravaAthleteProfile): string {
  const fullName = [athlete.firstname, athlete.lastname].filter(Boolean).join(" ").trim();
  if (fullName.length > 0) return fullName;
  if (athlete.username) return athlete.username;
  return `Strava athlete ${athlete.id}`;
}

export interface StravaGearSummary {
  id: string;
  name: string;
  primary: boolean;
  distanceMeters: number;
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

function stravaRequestLabel(url: URL | string): string {
  const parsed = typeof url === "string" ? new URL(url) : url;
  return `${parsed.pathname}${parsed.search}`;
}

function logStravaResponse(
  method: string,
  label: string,
  status: number,
  durationMs: number,
  detail?: string,
): void {
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`[strava] ← ${method} ${label} ${status} (${durationMs}ms)${suffix}`);
}

async function fetchJson(url: URL | string, init: RequestInit): Promise<unknown> {
  const method = init.method ?? "GET";
  const label = stravaRequestLabel(url);
  const startedAt = Date.now();
  console.log(`[strava] → ${method} ${label}`);

  const res = await fetch(url, init);
  const durationMs = Date.now() - startedAt;

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ?? detail;
    } catch {
      // Keep status text if Strava did not return JSON.
    }
    logStravaResponse(method, label, res.status, durationMs, detail);
    throw new HttpError(res.status === 401 ? 401 : 502, `Strava request failed: ${detail}`);
  }

  const data = await res.json();
  const responseDetail = Array.isArray(data) ? `items=${data.length}` : undefined;
  logStravaResponse(method, label, res.status, durationMs, responseDetail);
  return data;
}

export async function fetchStravaActivities(accessToken: string): Promise<StravaActivity[]> {
  const activities: StravaActivity[] = [];
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_ACTIVITY_PAGES; page++) {
    const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
    url.searchParams.set("per_page", String(ACTIVITIES_PER_PAGE));
    url.searchParams.set("page", String(page));

    const raw = await fetchJson(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!Array.isArray(raw) || raw.length === 0) break;

    pagesFetched += 1;
    for (const item of raw) {
      const activity = normalizeActivity(item as RawStravaActivity);
      if (activity) activities.push(activity);
    }

    if (raw.length < ACTIVITIES_PER_PAGE) break;
  }

  console.log(
    `[strava] activities summary: ${activities.length} normalized across ${pagesFetched} page${pagesFetched === 1 ? "" : "s"}`,
  );
  return activities;
}

function normalizeGearSummaries(raw: unknown): StravaGearSummary[] {
  if (!Array.isArray(raw)) return [];

  const gear: StravaGearSummary[] = [];
  for (const item of raw) {
    const bike = item as Record<string, unknown>;
    if (typeof bike.id !== "string" || typeof bike.name !== "string") continue;
    const distance = Number(bike.distance ?? 0);
    gear.push({
      id: bike.id,
      name: bike.name,
      primary: bike.primary === true,
      distanceMeters: Number.isFinite(distance) ? Math.max(0, Math.round(distance)) : 0,
    });
  }
  return gear;
}

export async function fetchStravaAthleteBikes(accessToken: string): Promise<StravaGearSummary[]> {
  const raw = await fetchJson(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = raw as { bikes?: unknown };
  const bikes = normalizeGearSummaries(data.bikes);
  console.log(`[strava] athlete bikes: ${bikes.length} registered`);
  return bikes;
}

export async function fetchStravaGearName(
  accessToken: string,
  gearId: string,
): Promise<string | null> {
  const raw = await fetchJson(`${STRAVA_API_BASE}/gear/${gearId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = raw as { name?: unknown };
  return typeof data.name === "string" && data.name.length > 0 ? data.name : null;
}

export function buildStravaAuthorizationUrl(state: string): string {
  const { clientId } = requireStravaCredentials();
  const redirectUri =
    process.env.STRAVA_REDIRECT_URI ?? "http://localhost:3001/api/strava/callback";
  const scopes = process.env.STRAVA_SCOPES ?? "read,activity:read_all,profile:read_all";
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  return url.toString();
}

function parseAthleteProfile(
  raw: Record<string, unknown> | undefined,
): StravaAthleteProfile | undefined {
  if (!raw || (typeof raw.id !== "string" && typeof raw.id !== "number")) {
    return undefined;
  }

  return {
    id: String(raw.id),
    firstname: typeof raw.firstname === "string" ? raw.firstname : undefined,
    lastname: typeof raw.lastname === "string" ? raw.lastname : undefined,
    username: typeof raw.username === "string" ? raw.username : undefined,
    profile: typeof raw.profile === "string" ? raw.profile : undefined,
    profileMedium: typeof raw.profile_medium === "string" ? raw.profile_medium : undefined,
    email: typeof raw.email === "string" ? raw.email : undefined,
  };
}

function parseTokenResponse(raw: unknown, fallbackScope?: string): StravaTokenResponse {
  const data = raw as Record<string, unknown>;
  const athlete = parseAthleteProfile(data.athlete as Record<string, unknown> | undefined);
  if (
    !athlete ||
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    typeof data.expires_at !== "number"
  ) {
    throw new HttpError(502, "Strava returned an invalid OAuth response");
  }
  return {
    athleteId: athlete.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAtMs: data.expires_at * 1000,
    scope: typeof data.scope === "string" ? data.scope : fallbackScope,
    athlete,
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
