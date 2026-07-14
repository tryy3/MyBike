import { describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { account, user } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { HttpError } from "../lib/errors.js";
import { assertStravaAthleteAvailable, upsertStravaAccount } from "../lib/strava-account.js";

function stravaToken(athleteId: string) {
  return {
    athleteId,
    accessToken: "access",
    refreshToken: "refresh",
    expiresAtMs: Date.now() + 3_600_000,
    scope: "read,activity:read_all,profile:read_all",
  };
}

describe("strava account linking", () => {
  it("rejects Strava athlete already linked to another user", async () => {
    const userA = await db
      .insert(user)
      .values({
        id: crypto.randomUUID(),
        name: "User A",
        email: `a-${crypto.randomUUID()}@example.com`,
        emailVerified: true,
      })
      .returning()
      .get();
    const userB = await db
      .insert(user)
      .values({
        id: crypto.randomUUID(),
        name: "User B",
        email: `b-${crypto.randomUUID()}@example.com`,
        emailVerified: true,
      })
      .returning()
      .get();

    await upsertStravaAccount(userA!.id, stravaToken("athlete-shared"));

    await expect(assertStravaAthleteAvailable("athlete-shared", userB!.id)).rejects.toThrow(
      HttpError,
    );
    await expect(upsertStravaAccount(userB!.id, stravaToken("athlete-shared"))).rejects.toThrow(
      /already linked/,
    );

    await db.delete(account).where(eq(account.userId, userA!.id)).run();
    await db.delete(user).where(eq(user.id, userA!.id)).run();
    await db.delete(user).where(eq(user.id, userB!.id)).run();
  });

  it("allows the same user to refresh their Strava account", async () => {
    const row = await db
      .insert(user)
      .values({
        id: crypto.randomUUID(),
        name: "User C",
        email: `c-${crypto.randomUUID()}@example.com`,
        emailVerified: true,
      })
      .returning()
      .get();

    await upsertStravaAccount(row!.id, stravaToken("athlete-solo"));
    await expect(
      upsertStravaAccount(row!.id, stravaToken("athlete-solo")),
    ).resolves.toBeUndefined();

    await db.delete(account).where(eq(account.userId, row!.id)).run();
    await db.delete(user).where(eq(user.id, row!.id)).run();
  });
});
