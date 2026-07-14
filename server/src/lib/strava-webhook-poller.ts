import { randomUUID } from "node:crypto";
import type { StravaWebhookProcessResult } from "shared";
import { child, withLogContext } from "./logging/index.js";
import { createStravaEventSource } from "./strava-event-source.js";
import { getLastProxyEventId, setLastProxyEventId } from "./strava-webhook-cursor.js";
import { processWebhookEvent } from "./strava-webhook-processor.js";

const log = child({ component: "strava-webhook" });

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
  const pollId = randomUUID();

  return withLogContext({ pollId, operation: "webhook-poll" }, async () => {
    if (!eventSource) {
      return { eventsProcessed: 0, activitiesImported: 0, skipped: 0 };
    }

    const result: StravaWebhookProcessResult = {
      eventsProcessed: 0,
      activitiesImported: 0,
      skipped: 0,
      errors: [],
    };

    let afterId = await getLastProxyEventId();

    while (true) {
      let batch;
      try {
        batch = await eventSource.fetchEvents({ afterId, limit: BATCH_LIMIT, requestId: pollId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors ??= [];
        result.errors.push(`fetch: ${message}`);
        log.error({ err, afterId, pollId }, "Webhook proxy fetch failed");
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
          await setLastProxyEventId(event.id);
          afterId = event.id;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors ??= [];
          result.errors.push(`event ${event.id}: ${message}`);
          log.error({ err, proxyEventId: event.id, pollId }, "Failed to process webhook event");
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

    const errorCount = result.errors?.length ?? 0;
    if (result.eventsProcessed > 0 || errorCount > 0) {
      log.info(
        {
          pollId,
          eventsProcessed: result.eventsProcessed,
          activitiesImported: result.activitiesImported,
          skipped: result.skipped,
          errorCount,
        },
        "Webhook poll complete",
      );
    }

    return result;
  });
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
    log.error({ err }, "Unexpected webhook drain failure");
    return {
      eventsProcessed: 0,
      activitiesImported: 0,
      skipped: 0,
      errors: [`webhook drain failed: ${message}`],
    };
  }
}
