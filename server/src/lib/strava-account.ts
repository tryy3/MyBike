import { and, eq } from "drizzle-orm";
import { account } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { HttpError } from "./errors.js";
import { child } from "./logging/index.js";
import {
  STRAVA_PROVIDER_ID,
  revokeStravaAccessToken,
  type StravaTokenResponse,
} from "./strava-client.js";
import { findStravaAccount } from "./strava-token.js";

const log = child({ component: "strava" });

export async function findStravaAccountByAthleteId(athleteId: string) {
  return db
    .select()
    .from(account)
    .where(and(eq(account.providerId, STRAVA_PROVIDER_ID), eq(account.accountId, athleteId)))
    .get();
}

export async function assertStravaAthleteAvailable(
  athleteId: string,
  userId: string,
): Promise<void> {
  const existing = await findStravaAccountByAthleteId(athleteId);
  if (existing && existing.userId !== userId) {
    log.warn(
      { athleteId, userId, existingUserId: existing.userId },
      "Strava athlete already linked to another user",
    );
    throw new HttpError(
      409,
      "This Strava account is already linked to another MyBike user. Sign in with that account instead.",
    );
  }
}

export async function upsertStravaAccount(
  userId: string,
  token: StravaTokenResponse,
): Promise<void> {
  if (!token.athleteId) {
    throw new HttpError(502, "Strava returned an invalid OAuth response");
  }
  await assertStravaAthleteAvailable(token.athleteId, userId);

  const existing = await findStravaAccount(userId);
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
    await db.update(account).set(values).where(eq(account.id, existing.id)).run();
    return;
  }

  await db
    .insert(account)
    .values({
      id: crypto.randomUUID(),
      ...values,
    })
    .run();
}

export async function disconnectStravaUser(userId: string): Promise<void> {
  const row = await findStravaAccount(userId);
  if (row?.accessToken) {
    await revokeStravaAccessToken(row.accessToken);
  }
  if (row) {
    await db.delete(account).where(eq(account.id, row.id)).run();
  }
}
