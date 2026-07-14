import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { stravaWebhookCursor } from "../db/schema.js";

const CURSOR_ROW_ID = 1;

export async function getLastProxyEventId(): Promise<number> {
  const row = await db
    .select()
    .from(stravaWebhookCursor)
    .where(eq(stravaWebhookCursor.id, CURSOR_ROW_ID))
    .get();
  return row?.lastProxyEventId ?? 0;
}

export async function setLastProxyEventId(lastProxyEventId: number): Promise<void> {
  const now = Date.now();
  const existing = await db
    .select({ id: stravaWebhookCursor.id })
    .from(stravaWebhookCursor)
    .where(eq(stravaWebhookCursor.id, CURSOR_ROW_ID))
    .get();

  if (existing) {
    await db
      .update(stravaWebhookCursor)
      .set({ lastProxyEventId, updatedAt: now })
      .where(eq(stravaWebhookCursor.id, CURSOR_ROW_ID))
      .run();
    return;
  }

  await db
    .insert(stravaWebhookCursor)
    .values({ id: CURSOR_ROW_ID, lastProxyEventId, updatedAt: now })
    .run();
}
