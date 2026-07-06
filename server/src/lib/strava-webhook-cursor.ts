import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { stravaWebhookCursor } from "../db/schema.js";

const CURSOR_ROW_ID = 1;

export function getLastProxyEventId(): number {
  const row = db
    .select()
    .from(stravaWebhookCursor)
    .where(eq(stravaWebhookCursor.id, CURSOR_ROW_ID))
    .get();
  return row?.lastProxyEventId ?? 0;
}

export function setLastProxyEventId(lastProxyEventId: number): void {
  const now = Date.now();
  const existing = db
    .select({ id: stravaWebhookCursor.id })
    .from(stravaWebhookCursor)
    .where(eq(stravaWebhookCursor.id, CURSOR_ROW_ID))
    .get();

  if (existing) {
    db.update(stravaWebhookCursor)
      .set({ lastProxyEventId, updatedAt: now })
      .where(eq(stravaWebhookCursor.id, CURSOR_ROW_ID))
      .run();
    return;
  }

  db.insert(stravaWebhookCursor)
    .values({ id: CURSOR_ROW_ID, lastProxyEventId, updatedAt: now })
    .run();
}
