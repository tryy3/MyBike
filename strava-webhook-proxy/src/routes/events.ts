import { Router } from "express";
import { and, asc, eq, gt, gte } from "drizzle-orm";
import type { StravaWebhookEvent } from "shared";
import { db, sqlite } from "../db/index.js";
import { webhookEvents } from "../db/schema.js";
import { requireApiKey } from "../lib/api-key-auth.js";

export const eventsRouter = Router();

function queryString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return fallback;
}

eventsRouter.get("/health", (_req, res) => {
  try {
    sqlite.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error", error: "Database unavailable" });
  }
});

eventsRouter.get("/events", requireApiKey, (req, res) => {
  const afterId = parseInt(queryString(req.query.after_id, "0"), 10);
  if (!Number.isFinite(afterId) || afterId < 0) {
    res.status(400).json({ error: "Invalid after_id" });
    return;
  }

  const limitRaw = parseInt(queryString(req.query.limit, "100"), 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500);

  const sinceRaw = queryString(req.query.since, "");
  const since = sinceRaw !== "" ? parseInt(sinceRaw, 10) : undefined;
  if (since !== undefined && (!Number.isFinite(since) || since < 0)) {
    res.status(400).json({ error: "Invalid since" });
    return;
  }

  const ownerIdRaw = queryString(req.query.owner_id, "");
  const ownerId = ownerIdRaw !== "" ? parseInt(ownerIdRaw, 10) : undefined;
  if (ownerId !== undefined && (!Number.isFinite(ownerId) || ownerId < 0)) {
    res.status(400).json({ error: "Invalid owner_id" });
    return;
  }

  const conditions = [gt(webhookEvents.id, afterId)];
  if (since !== undefined) {
    conditions.push(gte(webhookEvents.eventTime, since));
  }
  if (ownerId !== undefined) {
    conditions.push(eq(webhookEvents.ownerId, ownerId));
  }

  const rows = db
    .select()
    .from(webhookEvents)
    .where(and(...conditions))
    .orderBy(asc(webhookEvents.id))
    .limit(limit)
    .all();

  const events = rows.map((row) => {
    const payload: StravaWebhookEvent = {
      aspect_type: row.aspectType as StravaWebhookEvent["aspect_type"],
      event_time: row.eventTime,
      object_id: row.objectId,
      object_type: row.objectType as StravaWebhookEvent["object_type"],
      owner_id: row.ownerId,
      subscription_id: row.subscriptionId,
    };
    if (row.updatesJson) {
      try {
        payload.updates = JSON.parse(row.updatesJson) as Record<string, unknown>;
      } catch {
        console.error(`[events] corrupt updates_json for webhook event ${row.id}`);
      }
    }
    return {
      id: row.id,
      receivedAt: new Date(row.receivedAt).toISOString(),
      payload,
    };
  });

  const nextAfterId = events.length > 0 ? events[events.length - 1]!.id : null;

  res.json({ events, nextAfterId });
});
