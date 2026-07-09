import type { StravaWebhookEnvelope } from "shared";
import { stravaWebhookProxyEventsSchema } from "shared";
import { child } from "./logging/index.js";

const log = child({ component: "strava-proxy-client" });

export interface StravaEventSource {
  fetchEvents(options: { afterId: number; limit?: number }): Promise<{
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
  }): Promise<{ events: StravaWebhookEnvelope[]; nextAfterId: number | null }> {
    const { afterId, limit } = options;
    log.debug({ afterId, limit }, "Fetching webhook events from proxy");

    const url = new URL("/api/events", this.baseUrl.replace(/\/$/, ""));
    url.searchParams.set("after_id", String(afterId));
    if (limit != null) {
      url.searchParams.set("limit", String(limit));
    }

    const startedAt = Date.now();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
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
      },
      "Fetched webhook events from proxy",
    );
    return parsed;
  }
}

export function createStravaEventSource(): StravaEventSource | null {
  const url = process.env.STRAVA_WEBHOOK_PROXY_URL;
  const apiKey = process.env.STRAVA_WEBHOOK_PROXY_API_KEY;
  if (!url || !apiKey) return null;
  return new ProxyStravaEventSource(url, apiKey);
}
