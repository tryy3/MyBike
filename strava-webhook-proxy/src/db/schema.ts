import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

function nowMs() {
  return Date.now();
}

export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    receivedAt: integer("received_at").notNull().$defaultFn(nowMs),
    objectType: text("object_type").notNull(),
    aspectType: text("aspect_type").notNull(),
    objectId: integer("object_id").notNull(),
    ownerId: integer("owner_id").notNull(),
    subscriptionId: integer("subscription_id").notNull(),
    eventTime: integer("event_time").notNull(),
    updatesJson: text("updates_json"),
    rawBody: text("raw_body").notNull(),
  },
  (t) => [
    index("idx_webhook_events_received_at").on(t.receivedAt),
    index("idx_webhook_events_owner_id").on(t.ownerId),
    index("idx_webhook_events_event_time").on(t.eventTime),
  ],
);

export type WebhookEventRow = typeof webhookEvents.$inferSelect;
