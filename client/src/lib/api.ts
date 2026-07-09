import type {
  ActivityDetail,
  ActivityList,
  ActivityUpdate,
  StravaImportCommit,
  StravaImportCommitResult,
  StravaImportPreview,
  StravaStatus,
  StravaBackfillResult,
  StravaSyncResult,
} from "shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function mergeHeaders(base: Record<string, string>, extra?: HeadersInit): Headers {
  const headers = new Headers(base);
  if (extra) {
    new Headers(extra).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: mergeHeaders({ "content-type": "application/json" }, options.headers),
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "error" in (body as Record<string, unknown>)
        ? String((body as Record<string, unknown>).error)
        : res.statusText;
    throw new ApiError(res.status, msg, (body as Record<string, unknown>)?.details);
  }

  return body as T;
}

function json(method: string, data: unknown): RequestInit {
  return { method, body: JSON.stringify(data) };
}

// --- Bikes -----------------------------------------------------------------

export const api = {
  // --- CSV import / export (REST) -------------------------------------------

  importComponents: (bikeId: string, csv: string, dryRun = false) =>
    apiFetch<ImportResult>(`/api/bikes/${bikeId}/components/import`, json("POST", { csv, dryRun })),

  exportComponentsUrl: (bikeId: string) => `/api/bikes/${bikeId}/components/export.csv`,

  // --- Strava ---------------------------------------------------------------
  getStravaStatus: () => apiFetch<StravaStatus>("/api/strava/status"),
  getStravaConnectUrl: () =>
    apiFetch<{ authorizationUrl: string }>("/api/strava/connect").then((r) => r.authorizationUrl),
  previewStravaImport: () => apiFetch<StravaImportPreview>("/api/strava/import/preview"),
  commitStravaImport: (data: StravaImportCommit) =>
    apiFetch<StravaImportCommitResult>("/api/strava/import/commit", json("POST", data)),
  syncStrava: () => apiFetch<StravaSyncResult>("/api/strava/sync", { method: "POST" }),
  backfillStravaComponents: () =>
    apiFetch<StravaBackfillResult>("/api/strava/backfill-components", { method: "POST" }),
  disconnectStrava: () =>
    apiFetch<{ disconnected: boolean }>("/api/strava/disconnect", { method: "POST" }),
  getStravaConfig: () => apiFetch<{ configured: boolean }>("/api/strava/config"),

  // --- Activities (REST) ---------------------------------------------------
  listBikeActivities: (bikeId: string, cursor?: string | null) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return apiFetch<ActivityList>(`/api/bikes/${bikeId}/activities${qs ? `?${qs}` : ""}`);
  },
  getActivity: (id: string) => apiFetch<ActivityDetail>(`/api/activities/${id}`),
  updateActivity: (id: string, data: ActivityUpdate) =>
    apiFetch<ActivityDetail>(`/api/activities/${id}`, json("PATCH", data)),
};

export interface ImportResult {
  bikeId?: string;
  dryRun?: boolean;
  inserted: number;
  updated: number;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export const queryKeys = {
  bikes: ["bikes"] as const,
  bike: (id: string) => ["bikes", id] as const,
  fieldSuggestions: ["field-suggestions"] as const,
  stravaStatus: ["strava", "status"] as const,
  stravaConfig: ["strava", "config"] as const,
  apiKeys: ["api-keys"] as const,
  bikeActivities: (id: string) => ["activities", "bike", id] as const,
};
