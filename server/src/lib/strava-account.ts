import { and, eq } from "drizzle-orm";
import { account } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { HttpError } from "./errors.js";
import {
  STRAVA_PROVIDER_ID,
  revokeStravaAccessToken,
  type StravaTokenResponse,
} from "./strava-client.js";
import { findStravaAccount } from "./strava-token.js";

export function findStravaAccountByAthleteId(athleteId: string) {
  return db
    .select()
    .from(account)
    .where(and(eq(account.providerId, STRAVA_PROVIDER_ID), eq(account.accountId, athleteId)))
    .get();
}

export function assertStravaAthleteAvailable(athleteId: string, userId: string): void {
  const existing = findStravaAccountByAthleteId(athleteId);
  if (existing && existing.userId !== userId) {
    throw new HttpError(
      409,
      "This Strava account is already linked to another MyBike user. Sign in with that account instead.",
    );
  }
}

export function upsertStravaAccount(userId: string, token: StravaTokenResponse): void {
  assertStravaAthleteAvailable(token.athleteId, userId);

  const existing = findStravaAccount(userId);
  const values = {
    accountId: token.athleteId,
    providerId: STRAVA_PROVIDER_ID,
    userId,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    accessTokenExpiresAt: new Date(token.expiresAtMs),
    scope: token.scope ?? "read,activity:read_all,profile:read_all",
  };

  if (existing) {
    db.update(account).set(values).where(eq(account.id, existing.id)).run();
    return;
  }

  db.insert(account)
    .values({
      id: crypto.randomUUID(),
      ...values,
    })
    .run();
}

export async function disconnectStravaUser(userId: string): Promise<void> {
  const row = findStravaAccount(userId);
  if (row?.accessToken) {
    await revokeStravaAccessToken(row.accessToken);
  }
  if (row) {
    db.delete(account).where(eq(account.id, row.id)).run();
  }
}
