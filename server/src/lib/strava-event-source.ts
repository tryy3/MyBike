import type { StravaWebhookEnvelope } from "shared";
import { stravaWebhookProxyEventsSchema } from "shared";
import { getLoadedAppConfigValue } from "../services/app-config.js";
import { child } from "./logging/index.js";

const log = child({ component: "strava-proxy-client" });

export interface StravaEventSource {
  fetchEvents(options: { afterId: number; limit?: number; requestId?: string }): Promise<{
    events: StravaWebhookEnvelope[];
    nextAfterId: number | null;
  }>;
}

export class ProxyStravaEventSource implements StravaEventSource {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async fetchEvents(options: {
    afterId: number;
    limit?: number;
    requestId?: string;
  }): Promise<{ events: StravaWebhookEnvelope[]; nextAfterId: number | null }> {
    const { afterId, limit, requestId } = options;
    log.debug({ afterId, limit, requestId }, "Fetching webhook events from proxy");

    const url = new URL("/api/events", this.baseUrl.replace(/\/$/, ""));
    url.searchParams.set("after_id", String(afterId));
    if (limit != null) {
      url.searchParams.set("limit", String(limit));
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (requestId) {
      headers["X-Request-Id"] = requestId;
    }

    const startedAt = Date.now();
    const res = await fetch(url, { headers });
    const durationMs = Date.now() - startedAt;

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Webhook proxy request failed (${res.status}): ${detail}`);
    }

    const raw: unknown = await res.json();
    const parsed = stravaWebhookProxyEventsSchema.parse(raw);
    log.info(
      {
        afterId,
        eventCount: parsed.events.length,
        nextAfterId: parsed.nextAfterId,
        durationMs,
        requestId,
      },
      "Fetched webhook events from proxy",
    );
    return parsed;
  }
}

export function getStravaWebhookProxyApiKey(): string | undefined {
  const configured = getLoadedAppConfigValue<string>("strava.webhook.proxyApiKey");
  const trimmed = configured?.trim();
  return trimmed ? trimmed : undefined;
}

export function getStravaWebhookProxyUrl(): string | undefined {
  const configured = getLoadedAppConfigValue<string>("strava.webhook.proxyUrl");
  const trimmed = configured?.trim();
  return trimmed ? trimmed : undefined;
}

export function createStravaEventSource(): StravaEventSource | null {
  const url = getStravaWebhookProxyUrl();
  const apiKey = getStravaWebhookProxyApiKey();
  if (!url || !apiKey) return null;
  return new ProxyStravaEventSource(url, apiKey);
}
