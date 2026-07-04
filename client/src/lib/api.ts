import type {
  Bike,
  BikeDetail,
  BikeInsert,
  BikeListItem,
  BikeUpdate,
  Component,
  ComponentInsert,
  ComponentReorder,
  ComponentUpdate,
  FieldSuggestions,
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
  listBikes: () => apiFetch<BikeListItem[]>("/api/bikes"),
  getBike: (id: string) => apiFetch<BikeDetail>(`/api/bikes/${id}`),
  createBike: (data: BikeInsert) => apiFetch<Bike>("/api/bikes", json("POST", data)),
  updateBike: (id: string, data: BikeUpdate) =>
    apiFetch<Bike>(`/api/bikes/${id}`, json("PUT", data)),
  deleteBike: (id: string) => apiFetch<void>(`/api/bikes/${id}`, { method: "DELETE" }),

  // --- Components --------------------------------------------------------

  createComponent: (bikeId: string, data: ComponentInsert) =>
    apiFetch<Component>(`/api/bikes/${bikeId}/components`, json("POST", data)),
  updateComponent: (id: string, data: ComponentUpdate) =>
    apiFetch<Component>(`/api/components/${id}`, json("PUT", data)),
  deleteComponent: (id: string) => apiFetch<void>(`/api/components/${id}`, { method: "DELETE" }),
  activateComponent: (id: string) =>
    apiFetch<Component>(`/api/components/${id}/activate`, { method: "PATCH" }),

  reorderComponents: (bikeId: string, data: ComponentReorder) =>
    apiFetch<void>(`/api/bikes/${bikeId}/components/reorder`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // --- CSV import / export --------------------------------------------------

  importComponents: (bikeId: string, csv: string, dryRun = false) =>
    apiFetch<ImportResult>(`/api/bikes/${bikeId}/components/import`, json("POST", { csv, dryRun })),

  // Direct browser download link for export — used as an `<a href download>`
  // so the file streams without going through the JSON apiFetch wrapper.
  exportComponentsUrl: (bikeId: string) => `/api/bikes/${bikeId}/components/export.csv`,

  getFieldSuggestions: () => apiFetch<FieldSuggestions>("/api/field-suggestions"),
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
};
