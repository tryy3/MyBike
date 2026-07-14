import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { and, eq } from "drizzle-orm";
import { account, user } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { refreshStravaAccessToken } from "../lib/strava-client.js";
import { findStravaAccount, getStravaAccessToken } from "../lib/strava-token.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.STRAVA_CLIENT_ID = "test-client";
  process.env.STRAVA_CLIENT_SECRET = "test-secret";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.STRAVA_CLIENT_ID;
  delete process.env.STRAVA_CLIENT_SECRET;
});

function seedExpiredStravaAccount() {
  const userId = crypto.randomUUID();
  const athleteId = "424242";
  db.insert(user)
    .values({
      id: userId,
      name: "Refresh Rider",
      email: `refresh-${userId}@example.com`,
      emailVerified: true,
    })
    .run();

  db.insert(account)
    .values({
      id: crypto.randomUUID(),
      accountId: athleteId,
      providerId: "strava",
      userId,
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      accessTokenExpiresAt: new Date(Date.now() - 60_000),
      scope: "read,activity:read_all,profile:read_all",
    })
    .run();

  return { userId, athleteId };
}

describe("refreshStravaAccessToken", () => {
  it("accepts refresh responses without athlete profile", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          token_type: "Bearer",
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_at: Math.floor(Date.now() / 1000) + 21_600,
          expires_in: 21_600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const refreshed = await refreshStravaAccessToken(
      "old-refresh-token",
      "read,activity:read_all,profile:read_all",
    );

    expect(refreshed.accessToken).toBe("new-access-token");
    expect(refreshed.refreshToken).toBe("new-refresh-token");
    expect(refreshed.athleteId).toBeUndefined();
    expect(refreshed.athlete).toBeUndefined();
    expect(refreshed.scope).toBe("read,activity:read_all,profile:read_all");
  });
});

describe("getStravaAccessToken", () => {
  it("persists refreshed tokens and keeps existing athlete id", async () => {
    const { userId, athleteId } = seedExpiredStravaAccount();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.pathname === "/oauth/token") {
        return new Response(
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_at: Math.floor(Date.now() / 1000) + 21_600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    const token = await getStravaAccessToken(userId);
    expect(token).toBe("new-access-token");

    const row = findStravaAccount(userId);
    expect(row?.accessToken).toBe("new-access-token");
    expect(row?.refreshToken).toBe("new-refresh-token");
    expect(row?.accountId).toBe(athleteId);

    db.delete(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "strava")))
      .run();
    db.delete(user).where(eq(user.id, userId)).run();
  });
});
