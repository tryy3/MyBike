import type {
  Bike,
  BikeDetail,
  BikeInsert,
  BikeListItem,
  BikeUpdate,
  ComponentOption,
  ComponentOptionInsert,
  ComponentOptionUpdate,
  ComponentSlot,
  ComponentSlotInsert,
  ComponentSlotUpdate,
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

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
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
    throw new ApiError(
      res.status,
      msg,
      (body as Record<string, unknown>)?.details,
    );
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
  createBike: (data: BikeInsert) =>
    apiFetch<Bike>("/api/bikes", json("POST", data)),
  updateBike: (id: string, data: BikeUpdate) =>
    apiFetch<Bike>(`/api/bikes/${id}`, json("PUT", data)),
  deleteBike: (id: string) =>
    apiFetch<void>(`/api/bikes/${id}`, { method: "DELETE" }),

  // --- Component slots ---------------------------------------------------

  createSlot: (bikeId: string, data: ComponentSlotInsert) =>
    apiFetch<ComponentSlot>(
      `/api/bikes/${bikeId}/slots`,
      json("POST", data),
    ),
  updateSlot: (id: string, data: ComponentSlotUpdate) =>
    apiFetch<ComponentSlot>(`/api/slots/${id}`, json("PUT", data)),
  deleteSlot: (id: string) =>
    apiFetch<void>(`/api/slots/${id}`, { method: "DELETE" }),

  // --- Component options -------------------------------------------------

  createOption: (slotId: string, data: ComponentOptionInsert) =>
    apiFetch<ComponentOption>(
      `/api/slots/${slotId}/options`,
      json("POST", data),
    ),
  updateOption: (id: string, data: ComponentOptionUpdate) =>
    apiFetch<ComponentOption>(`/api/options/${id}`, json("PUT", data)),
  deleteOption: (id: string) =>
    apiFetch<void>(`/api/options/${id}`, { method: "DELETE" }),
  activateOption: (id: string) =>
    apiFetch<ComponentOption>(
      `/api/options/${id}/activate`,
      { method: "PATCH" },
    ),
};

export const queryKeys = {
  bikes: ["bikes"] as const,
  bike: (id: string) => ["bikes", id] as const,
};