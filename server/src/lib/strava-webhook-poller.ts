import type { StravaWebhookProcessResult } from "shared";
import { createStravaEventSource } from "./strava-event-source.js";
import { getLastProxyEventId, setLastProxyEventId } from "./strava-webhook-cursor.js";
import { processWebhookEvent } from "./strava-webhook-processor.js";

const BATCH_LIMIT = 100;

let eventSource = createStravaEventSource();
let pollInFlight: Promise<StravaWebhookProcessResult> | null = null;

export function resetStravaEventSourceForTests(): void {
  eventSource = createStravaEventSource();
  pollInFlight = null;
}

export function setStravaEventSourceForTests(
  source: ReturnType<typeof createStravaEventSource>,
): void {
  eventSource = source;
  pollInFlight = null;
}

async function runPoll(): Promise<StravaWebhookProcessResult> {
  if (!eventSource) {
    return { eventsProcessed: 0, activitiesImported: 0, skipped: 0 };
  }

  const result: StravaWebhookProcessResult = {
    eventsProcessed: 0,
    activitiesImported: 0,
    skipped: 0,
    errors: [],
  };

  let afterId = getLastProxyEventId();

  while (true) {
    let batch;
    try {
      batch = await eventSource.fetchEvents({ afterId, limit: BATCH_LIMIT });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors ??= [];
      result.errors.push(`fetch: ${message}`);
      console.error("[strava-webhook] proxy fetch failed:", err);
      break;
    }

    if (batch.events.length === 0) break;

    let batchFailed = false;
    for (const event of batch.events) {
      try {
        const outcome = await processWebhookEvent(event);
        result.eventsProcessed += 1;
        if (outcome === "imported") {
          result.activitiesImported += 1;
        } else {
          result.skipped += 1;
        }
        setLastProxyEventId(event.id);
        afterId = event.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors ??= [];
        result.errors.push(`event ${event.id}: ${message}`);
        console.error(`[strava-webhook] failed to process event ${event.id}:`, err);
        batchFailed = true;
        break;
      }
    }

    if (batchFailed) break;
    if (batch.events.length < BATCH_LIMIT) break;
  }

  if (result.errors?.length === 0) {
    delete result.errors;
  }

  return result;
}

export function processPendingWebhookEvents(): Promise<StravaWebhookProcessResult> {
  if (pollInFlight) return pollInFlight;

  pollInFlight = runPoll().finally(() => {
    pollInFlight = null;
  });

  return pollInFlight;
}

/** Best-effort drain for manual sync — never throws. */
export async function drainWebhookEventsBestEffort(): Promise<StravaWebhookProcessResult> {
  try {
    return await processPendingWebhookEvents();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[strava-webhook] unexpected drain failure:", err);
    return {
      eventsProcessed: 0,
      activitiesImported: 0,
      skipped: 0,
      errors: [`webhook drain failed: ${message}`],
    };
  }
}
