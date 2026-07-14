import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { stravaSyncState } from "../db/schema.js";

const INITIAL_SYNC_LOOKBACK_MS = 365 * 24 * 60 * 60 * 1000;

export async function getSyncAfterSeconds(userId: string): Promise<number> {
  const row = await db
    .select()
    .from(stravaSyncState)
    .where(eq(stravaSyncState.userId, userId))
    .get();
  const ms = row?.lastSyncedAt ?? Date.now() - INITIAL_SYNC_LOOKBACK_MS;
  return Math.floor(ms / 1000);
}

export async function markSyncedNow(userId: string): Promise<void> {
  const now = Date.now();
  const existing = await db
    .select({ userId: stravaSyncState.userId })
    .from(stravaSyncState)
    .where(eq(stravaSyncState.userId, userId))
    .get();
  if (existing) {
    await db
      .update(stravaSyncState)
      .set({ lastSyncedAt: now })
      .where(eq(stravaSyncState.userId, userId))
      .run();
    return;
  }
  await db.insert(stravaSyncState).values({ userId, lastSyncedAt: now }).run();
}
