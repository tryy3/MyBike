import { and, eq } from "drizzle-orm";
import { account } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { HttpError } from "./errors.js";
import { child, withLogContext } from "./logging/index.js";
import { refreshStravaAccessToken, STRAVA_PROVIDER_ID } from "./strava-client.js";

const log = child({ component: "strava" });

const refreshLocks = new Map<string, Promise<string>>();

function toExpiresAt(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

export function findStravaAccount(userId: string) {
  return db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, STRAVA_PROVIDER_ID)))
    .get();
}

export function isStravaConnected(userId: string): boolean {
  return !!findStravaAccount(userId)?.accessToken;
}

async function refreshAndPersist(
  userId: string,
  refreshToken: string,
  scope: string | null,
): Promise<string> {
  return withLogContext({ userId, operation: "refreshToken" }, async () => {
    log.debug({ userId }, "Refreshing Strava access token");
    try {
      const refreshed = await refreshStravaAccessToken(refreshToken, scope);
      const row = findStravaAccount(userId);
      if (!row) {
        throw new HttpError(409, "Connect Strava before importing rides");
      }
      db.update(account)
        .set({
          accountId: refreshed.athleteId ?? row.accountId,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          accessTokenExpiresAt: new Date(refreshed.expiresAtMs),
          scope: refreshed.scope ?? row.scope,
        })
        .where(eq(account.id, row.id))
        .run();
      return refreshed.accessToken;
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        log.warn({ userId, err }, "Strava refresh failed — session expired");
        throw new HttpError(409, "Strava session expired — reconnect in Integrations");
      }
      throw err;
    }
  });
}

export async function getStravaAccessToken(userId: string): Promise<string> {
  const row = findStravaAccount(userId);
  if (!row?.accessToken) {
    throw new HttpError(409, "Connect Strava before importing rides");
  }

  const expiresAt = toExpiresAt(row.accessTokenExpiresAt);
  if (!row.refreshToken || expiresAt - Date.now() > 60_000) {
    return row.accessToken;
  }

  const pending = refreshLocks.get(userId);
  if (pending) return pending;

  const refreshPromise = refreshAndPersist(userId, row.refreshToken, row.scope).finally(() => {
    refreshLocks.delete(userId);
  });
  refreshLocks.set(userId, refreshPromise);
  return refreshPromise;
}
