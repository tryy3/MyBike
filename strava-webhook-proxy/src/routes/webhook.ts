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
  const mode = queryString(req.query["hub.mode"]);
  const challenge = queryString(req.query["hub.challenge"]);
  const token = queryString(req.query["hub.verify_token"]);
  const expected = verifyToken();

  if (mode === "subscribe" && challenge && token && expected && safeEqual(token, expected)) {
    res.json({ "hub.challenge": challenge });
    return;
  }

  res.status(403).json({ error: "Forbidden" });
});

webhookRouter.post("/strava", rateLimitWebhook, (req, res) => {
  const parsed = stravaWebhookEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }

  const event = parsed.data;
  const subscriptionId = expectedSubscriptionId();
  if (subscriptionId !== undefined && event.subscription_id !== subscriptionId) {
    console.warn(
      `[webhook] ignoring event with subscription_id ${event.subscription_id} (expected ${subscriptionId})`,
    );
    res.sendStatus(200);
    return;
  }

  const rawBody = JSON.stringify(req.body);

  db.insert(webhookEvents)
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

  res.sendStatus(200);
});
