import type { StravaWebhookEnvelope } from "shared";
import { stravaWebhookProxyEventsSchema } from "shared";

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
    const url = new URL("/api/events", this.baseUrl.replace(/\/$/, ""));
    url.searchParams.set("after_id", String(options.afterId));
    if (options.limit != null) {
      url.searchParams.set("limit", String(options.limit));
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Webhook proxy request failed (${res.status}): ${detail}`);
    }

    const raw: unknown = await res.json();
    const parsed = stravaWebhookProxyEventsSchema.parse(raw);
    return parsed;
  }
}

export function createStravaEventSource(): StravaEventSource | null {
  const url = process.env.STRAVA_WEBHOOK_PROXY_URL;
  const apiKey = process.env.STRAVA_WEBHOOK_PROXY_API_KEY;
  if (!url || !apiKey) return null;
  return new ProxyStravaEventSource(url, apiKey);
}
