import type { StravaWebhookEnvelope } from "shared";
import { disconnectStravaUser, findStravaAccountByAthleteId } from "./strava-account.js";
import { syncActivitiesForUser } from "./strava-activity-sync.js";
import { fetchStravaActivity, probeStravaAccessToken } from "./strava-client.js";
import { getStravaAccessToken } from "./strava-token.js";

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
    console.warn(
      `[strava-webhook] ignoring event ${event.id} with subscription_id ${payload.subscription_id}`,
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
        console.warn(
          `[strava-webhook] ignoring deauth event ${event.id} — Strava token still valid`,
        );
        return "skipped";
      }

      await disconnectStravaUser(account.userId);
      return "disconnected";
    }
    return "skipped";
  }

  if (payload.object_type !== "activity") {
    return "skipped";
  }

  if (payload.aspect_type !== "create") {
    console.log(
      `[strava-webhook] skipping ${payload.object_type}.${payload.aspect_type} for activity ${payload.object_id}`,
    );
    return "skipped";
  }

  const account = findStravaAccountByAthleteId(athleteId);
  if (!account) {
    console.log(`[strava-webhook] no MyBike user for Strava athlete ${athleteId}`);
    return "skipped";
  }

  const token = await getStravaAccessToken(account.userId);
  const activity = await fetchStravaActivity(token, payload.object_id);
  if (!activity) {
    console.log(
      `[strava-webhook] activity ${payload.object_id} not imported (missing, non-cycling, or invalid)`,
    );
    return "skipped";
  }

  const result = syncActivitiesForUser(account.userId, [activity]);
  if (result.processedActivities > 0) {
    return "imported";
  }

  return "skipped";
}
