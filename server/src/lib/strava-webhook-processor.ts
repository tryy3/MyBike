import type { StravaWebhookEnvelope } from "shared";
import { child } from "./logging/index.js";
import { disconnectStravaUser, findStravaAccountByAthleteId } from "./strava-account.js";
import { syncActivitiesForUser } from "./strava-activity-sync.js";
import { fetchStravaActivity, probeStravaAccessToken } from "./strava-client.js";
import { getStravaAccessToken } from "./strava-token.js";

const log = child({ component: "strava-webhook" });

export type WebhookProcessOutcome = "imported" | "skipped" | "disconnected";

function expectedSubscriptionId(): number | undefined {
  const raw = process.env.STRAVA_SUBSCRIPTION_ID;
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rejectUnexpectedSubscription(payload: StravaWebhookEnvelope["payload"]): boolean {
  const expected = expectedSubscriptionId();
  if (expected === undefined) return false;
  return payload.subscription_id !== expected;
}

export async function processWebhookEvent(
  event: StravaWebhookEnvelope,
): Promise<WebhookProcessOutcome> {
  const { payload } = event;

  if (rejectUnexpectedSubscription(payload)) {
    log.warn(
      { proxyEventId: event.id, subscriptionId: payload.subscription_id },
      "Ignoring webhook event with unexpected subscription",
    );
    return "skipped";
  }

  const athleteId = String(payload.owner_id);

  if (payload.object_type === "athlete") {
    if (payload.aspect_type === "update" && payload.updates?.authorized === "false") {
      const account = findStravaAccountByAthleteId(athleteId);
      if (!account) return "skipped";

      const token = await getStravaAccessToken(account.userId);
      const probe = await probeStravaAccessToken(token);
      if (probe === "error") {
        throw new Error(`unable to verify Strava token for athlete ${athleteId}`);
      }
      if (probe === "valid") {
        log.warn(
          { proxyEventId: event.id, athleteId },
          "Ignoring deauth event — Strava token still valid",
        );
        return "skipped";
      }

      await disconnectStravaUser(account.userId);
      log.info(
        { proxyEventId: event.id, athleteId, outcome: "disconnected" },
        "Webhook event processed",
      );
      return "disconnected";
    }
    return "skipped";
  }

  if (payload.object_type !== "activity") {
    return "skipped";
  }

  if (payload.aspect_type !== "create") {
    log.debug(
      {
        aspectType: payload.aspect_type,
        objectType: payload.object_type,
        stravaObjectId: payload.object_id,
      },
      "Skipping non-create activity webhook",
    );
    return "skipped";
  }

  const account = findStravaAccountByAthleteId(athleteId);
  if (!account) {
    log.debug({ athleteId }, "No MyBike user for Strava athlete");
    return "skipped";
  }

  const token = await getStravaAccessToken(account.userId);
  const activity = await fetchStravaActivity(token, payload.object_id);
  if (!activity) {
    log.debug(
      { stravaObjectId: payload.object_id },
      "Activity not imported (missing, non-cycling, or invalid)",
    );
    return "skipped";
  }

  const result = syncActivitiesForUser(account.userId, [activity]);
  if (result.processedActivities > 0) {
    log.info(
      {
        proxyEventId: event.id,
        athleteId,
        stravaObjectId: payload.object_id,
        outcome: "imported",
        skipReasons: result.skipReasons,
      },
      "Webhook event processed",
    );
    return "imported";
  }

  log.debug(
    {
      proxyEventId: event.id,
      athleteId,
      stravaObjectId: payload.object_id,
      skipReasons: result.skipReasons,
    },
    "Webhook activity sync skipped",
  );

  return "skipped";
}
