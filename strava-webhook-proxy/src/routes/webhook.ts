import { Router } from "express";
import { stravaWebhookEventSchema } from "shared";
import { safeEqual } from "../lib/api-key-auth.js";
import { rateLimitWebhook } from "../lib/rate-limit.js";
import { db } from "../db/index.js";
import { webhookEvents } from "../db/schema.js";

export const webhookRouter = Router();

function verifyToken(): string | undefined {
  return process.env.STRAVA_VERIFY_TOKEN;
}

function expectedSubscriptionId(): number | undefined {
  const raw = process.env.STRAVA_SUBSCRIPTION_ID;
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function queryString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

webhookRouter.get("/strava", (req, res) => {
  const log = req.log.child({ component: "webhook" });
  const mode = queryString(req.query["hub.mode"]);
  const challenge = queryString(req.query["hub.challenge"]);
  const token = queryString(req.query["hub.verify_token"]);
  const expected = verifyToken();

  if (mode === "subscribe" && challenge && token && expected && safeEqual(token, expected)) {
    res.json({ "hub.challenge": challenge });
    return;
  }

  log.warn({ mode, hasChallenge: !!challenge }, "Strava webhook subscription challenge rejected");
  res.status(403).json({ error: "Forbidden" });
});

webhookRouter.post("/strava", rateLimitWebhook, async (req, res) => {
  const log = req.log.child({ component: "webhook" });
  const parsed = stravaWebhookEventSchema.safeParse(req.body);
  if (!parsed.success) {
    log.warn("Invalid Strava webhook payload");
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }

  const event = parsed.data;
  const subscriptionId = expectedSubscriptionId();
  if (subscriptionId !== undefined && event.subscription_id !== subscriptionId) {
    log.warn(
      { subscriptionId: event.subscription_id, expectedSubscriptionId: subscriptionId },
      "Ignoring webhook event with unexpected subscription",
    );
    res.sendStatus(200);
    return;
  }

  const rawBody = JSON.stringify(req.body);

  await db
    .insert(webhookEvents)
    .values({
      objectType: event.object_type,
      aspectType: event.aspect_type,
      objectId: event.object_id,
      ownerId: event.owner_id,
      subscriptionId: event.subscription_id,
      eventTime: event.event_time,
      updatesJson: event.updates ? JSON.stringify(event.updates) : null,
      rawBody,
    })
    .run();

  log.info(
    {
      objectType: event.object_type,
      aspectType: event.aspect_type,
      objectId: event.object_id,
      ownerId: event.owner_id,
      eventTime: event.event_time,
    },
    "Strava webhook event stored",
  );

  res.sendStatus(200);
});
