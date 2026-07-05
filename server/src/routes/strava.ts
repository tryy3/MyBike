import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { account } from "../db/auth-schema.js";
import { bikes, components, stravaActivities, stravaActivityComponents } from "../db/schema.js";
import type { BikeRow } from "../db/schema.js";
import { db } from "../db/index.js";
import { HttpError, badRequest, notFound } from "../lib/errors.js";
import { getAuthContext, requireAuth } from "../lib/require-auth.js";
import { parseBody } from "../lib/validation.js";
import {
  buildStravaAuthorizationUrl,
  exchangeStravaCode,
  fetchStravaActivities,
  fetchStravaAthleteBikes,
  fetchStravaGearName,
  refreshStravaAccessToken,
  type StravaActivity,
  type StravaTokenResponse,
} from "../lib/strava-client.js";
import { stravaImportCommitSchema, type StravaImportDecision } from "shared";

const STRAVA_PROVIDER_ID = "strava";
const OAUTH_STATE_COOKIE = "mybike_strava_state";

export const stravaRouter = Router();

interface GearAggregate {
  gearId: string;
  stravaBikeName: string;
  distanceMeters: number;
  movingTimeMinutes: number;
  activityCount: number;
  activities: StravaActivity[];
}

interface SyncCounters {
  processedActivities: number;
  skippedActivities: number;
  creditedComponents: number;
}

stravaRouter.use(requireAuth);

function toExpiresAt(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    cookies[rawKey] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

interface BikeMatch {
  bike: BikeRow;
  reason: "strava_link" | "name";
}

function applyGearNames(
  aggregates: Map<string, GearAggregate>,
  gearNames: Map<string, string>,
): void {
  for (const aggregate of aggregates.values()) {
    const resolved = gearNames.get(aggregate.gearId);
    if (resolved) aggregate.stravaBikeName = resolved;
  }
}

function needsGearLookup(aggregate: GearAggregate, gearNames: Map<string, string>): boolean {
  if (gearNames.has(aggregate.gearId)) return false;
  return aggregate.stravaBikeName === aggregate.gearId || aggregate.stravaBikeName.length === 0;
}

async function resolveMissingGearNames(
  token: string,
  aggregates: Map<string, GearAggregate>,
  gearNames: Map<string, string>,
): Promise<void> {
  const missing = [...aggregates.values()].filter((aggregate) =>
    needsGearLookup(aggregate, gearNames),
  );
  if (missing.length === 0) return;

  await Promise.all(
    missing.map(async (aggregate) => {
      const name = await fetchStravaGearName(token, aggregate.gearId);
      if (name) aggregate.stravaBikeName = name;
    }),
  );
}

function aggregateActivities(activities: StravaActivity[]): Map<string, GearAggregate> {
  const byGear = new Map<string, GearAggregate>();

  for (const activity of activities) {
    if (!activity.gearId) continue;
    const current =
      byGear.get(activity.gearId) ??
      ({
        gearId: activity.gearId,
        stravaBikeName: activity.gearName ?? activity.gearId,
        distanceMeters: 0,
        movingTimeMinutes: 0,
        activityCount: 0,
        activities: [],
      } satisfies GearAggregate);

    current.distanceMeters += activity.distanceMeters;
    current.movingTimeMinutes += activity.movingTimeMinutes;
    current.activityCount += 1;
    current.activities.push(activity);
    if (activity.gearName) current.stravaBikeName = activity.gearName;
    byGear.set(activity.gearId, current);
  }

  return byGear;
}

function findStravaAccount(userId: string) {
  return db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, STRAVA_PROVIDER_ID)))
    .get();
}

async function getStravaAccessToken(userId: string): Promise<string> {
  const row = findStravaAccount(userId);
  if (!row?.accessToken) {
    throw new HttpError(409, "Connect Strava before importing rides");
  }

  const expiresAt = toExpiresAt(row.accessTokenExpiresAt);
  if (!row.refreshToken || expiresAt - Date.now() > 60_000) {
    return row.accessToken;
  }

  const refreshed = await refreshStravaAccessToken(row.refreshToken, row.scope);
  db.update(account)
    .set({
      accountId: refreshed.athleteId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpiresAt: new Date(refreshed.expiresAtMs),
      scope: refreshed.scope ?? row.scope,
    })
    .where(eq(account.id, row.id))
    .run();
  return refreshed.accessToken;
}

function upsertStravaAccount(userId: string, token: StravaTokenResponse): void {
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

function matchBike(aggregate: GearAggregate, allBikes: BikeRow[]): BikeMatch | null {
  const linked = allBikes.find((bike) => bike.stravaGearId === aggregate.gearId);
  if (linked) return { bike: linked, reason: "strava_link" };

  const normalizedStravaName = normalizeName(aggregate.stravaBikeName);
  if (normalizedStravaName.length === 0) return null;

  const byName = allBikes.find((bike) => normalizeName(bike.name) === normalizedStravaName);
  return byName ? { bike: byName, reason: "name" } : null;
}

function ensureDecisionGear(
  aggregates: Map<string, GearAggregate>,
  decision: StravaImportDecision,
): GearAggregate {
  const existing = aggregates.get(decision.gearId);
  if (existing) return existing;

  return {
    gearId: decision.gearId,
    stravaBikeName: `Strava bike ${decision.gearId}`,
    distanceMeters: 0,
    movingTimeMinutes: 0,
    activityCount: 0,
    activities: [],
  };
}

function createImportedMileageComponent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  bikeId: string,
  aggregate: GearAggregate,
): void {
  if (aggregate.activityCount === 0) return;

  tx.insert(components)
    .values({
      bikeId,
      category: "other",
      name: "Strava mileage estimate",
      brand: "Strava",
      model: aggregate.stravaBikeName,
      notes:
        "Created during Strava import so historical ride distance has an initial component to credit.",
      distanceMeters: 0,
      movingTimeMinutes: 0,
      isActive: true,
      sortOrder: 0,
    })
    .run();
}

function processActivity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  activity: StravaActivity,
): SyncCounters {
  if (!activity.gearId) {
    return { processedActivities: 0, skippedActivities: 1, creditedComponents: 0 };
  }

  const existing = tx
    .select({ id: stravaActivities.id })
    .from(stravaActivities)
    .where(
      and(
        eq(stravaActivities.userId, userId),
        eq(stravaActivities.stravaActivityId, activity.stravaActivityId),
      ),
    )
    .get();
  if (existing) {
    return { processedActivities: 0, skippedActivities: 1, creditedComponents: 0 };
  }

  const bike = tx
    .select()
    .from(bikes)
    .where(and(eq(bikes.userId, userId), eq(bikes.stravaGearId, activity.gearId)))
    .get();
  if (!bike) {
    return { processedActivities: 0, skippedActivities: 1, creditedComponents: 0 };
  }

  const createdActivity = tx
    .insert(stravaActivities)
    .values({
      userId,
      bikeId: bike.id,
      stravaActivityId: activity.stravaActivityId,
      stravaGearId: activity.gearId,
      distanceMeters: activity.distanceMeters,
      movingTimeMinutes: activity.movingTimeMinutes,
      startDate: activity.startDate,
    })
    .returning()
    .get();

  const activeComponents = tx
    .select()
    .from(components)
    .where(and(eq(components.bikeId, bike.id), eq(components.isActive, true)))
    .all();

  for (const component of activeComponents) {
    tx.update(components)
      .set({
        distanceMeters: sql`coalesce(${components.distanceMeters}, 0) + ${activity.distanceMeters}`,
        movingTimeMinutes: sql`coalesce(${components.movingTimeMinutes}, 0) + ${activity.movingTimeMinutes}`,
      })
      .where(eq(components.id, component.id))
      .run();
    tx.insert(stravaActivityComponents)
      .values({
        activityId: createdActivity.id,
        componentId: component.id,
        distanceMeters: activity.distanceMeters,
        movingTimeMinutes: activity.movingTimeMinutes,
      })
      .run();
  }

  return {
    processedActivities: 1,
    skippedActivities: 0,
    creditedComponents: activeComponents.length,
  };
}

function addCounters(target: SyncCounters, source: SyncCounters): void {
  target.processedActivities += source.processedActivities;
  target.skippedActivities += source.skippedActivities;
  target.creditedComponents += source.creditedComponents;
}

async function loadAggregates(userId: string): Promise<Map<string, GearAggregate>> {
  const token = await getStravaAccessToken(userId);
  const [activities, athleteBikes] = await Promise.all([
    fetchStravaActivities(token),
    fetchStravaAthleteBikes(token),
  ]);
  const gearNames = new Map(athleteBikes.map((bike) => [bike.id, bike.name]));
  const aggregates = aggregateActivities(activities);
  applyGearNames(aggregates, gearNames);
  await resolveMissingGearNames(token, aggregates, gearNames);
  return aggregates;
}

stravaRouter.get("/status", (req, res) => {
  const { userId } = getAuthContext(req);
  const linkedBikes = db
    .select({ id: bikes.id })
    .from(bikes)
    .where(and(eq(bikes.userId, userId), sql`${bikes.stravaGearId} IS NOT NULL`))
    .all().length;

  res.json({
    connected: !!findStravaAccount(userId),
    linkedBikes,
  });
});

stravaRouter.get("/connect", (req, res) => {
  const state = crypto.randomUUID();
  res.setHeader(
    "Set-Cookie",
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/strava; Max-Age=600`,
  );
  res.json({ authorizationUrl: buildStravaAuthorizationUrl(state) });
});

stravaRouter.get("/callback", async (req, res) => {
  const { userId } = getAuthContext(req);
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const expectedState = parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE];

  if (!code || !state || !expectedState || state !== expectedState) {
    throw badRequest("Invalid Strava OAuth callback");
  }

  const token = await exchangeStravaCode(code);
  upsertStravaAccount(userId, token);
  res.setHeader(
    "Set-Cookie",
    `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/strava; Max-Age=0`,
  );
  res.redirect(`${process.env.CLIENT_URL ?? "http://localhost:5173"}/settings/integrations`);
});

stravaRouter.get("/import/preview", async (req, res) => {
  const { userId } = getAuthContext(req);
  const aggregates = await loadAggregates(userId);
  const allBikes = db.select().from(bikes).where(eq(bikes.userId, userId)).all();

  const items = [...aggregates.values()]
    .map((aggregate) => {
      const matched = matchBike(aggregate, allBikes);
      return {
        gearId: aggregate.gearId,
        stravaBikeName: aggregate.stravaBikeName,
        distanceMeters: aggregate.distanceMeters,
        movingTimeMinutes: aggregate.movingTimeMinutes,
        activityCount: aggregate.activityCount,
        matchedBikeId: matched?.bike.id ?? null,
        matchedBikeName: matched?.bike.name ?? null,
        matchReason: matched?.reason ?? null,
        recommendedAction: matched ? "link" : "create",
      };
    })
    .sort((a, b) => a.stravaBikeName.localeCompare(b.stravaBikeName));

  res.json({ items });
});

stravaRouter.post("/import/commit", async (req, res) => {
  const { userId } = getAuthContext(req);
  const data = parseBody(req, stravaImportCommitSchema);
  const duplicateGearIds = data.decisions
    .map((decision) => decision.gearId)
    .filter((gearId, index, all) => all.indexOf(gearId) !== index);
  if (duplicateGearIds.length > 0) {
    throw badRequest("Each Strava bike can only appear once in an import");
  }

  const aggregates = await loadAggregates(userId);
  const result = db.transaction((tx) => {
    const counters = {
      linked: 0,
      created: 0,
      skipped: 0,
      processedActivities: 0,
      skippedActivities: 0,
      creditedComponents: 0,
    };

    for (const decision of data.decisions) {
      const aggregate = ensureDecisionGear(aggregates, decision);

      if (decision.action === "skip") {
        counters.skipped += 1;
        continue;
      }

      const alreadyLinked = tx
        .select()
        .from(bikes)
        .where(and(eq(bikes.userId, userId), eq(bikes.stravaGearId, decision.gearId)))
        .get();

      let bike: BikeRow;
      if (decision.action === "link") {
        const linkedBike = tx
          .select()
          .from(bikes)
          .where(and(eq(bikes.id, decision.bikeId), eq(bikes.userId, userId)))
          .get();
        if (!linkedBike) throw notFound("Bike");
        bike = linkedBike;
        if (alreadyLinked && alreadyLinked.id !== bike.id) {
          throw badRequest("That Strava bike is already linked to another bike");
        }
        tx.update(bikes).set({ stravaGearId: decision.gearId }).where(eq(bikes.id, bike.id)).run();
        counters.linked += 1;
      } else {
        if (alreadyLinked) {
          throw badRequest("That Strava bike is already linked to another bike");
        }
        bike = tx
          .insert(bikes)
          .values({
            userId,
            name: aggregate.stravaBikeName,
            stravaGearId: decision.gearId,
          })
          .returning()
          .get();
        createImportedMileageComponent(tx, bike.id, aggregate);
        counters.created += 1;
      }

      for (const activity of aggregate.activities) {
        addCounters(counters, processActivity(tx, userId, activity));
      }
    }

    return counters;
  });

  res.json(result);
});

stravaRouter.post("/sync", async (req, res) => {
  const { userId } = getAuthContext(req);
  const token = await getStravaAccessToken(userId);
  const activities = await fetchStravaActivities(token);
  const result = db.transaction((tx) => {
    const counters: SyncCounters = {
      processedActivities: 0,
      skippedActivities: 0,
      creditedComponents: 0,
    };
    for (const activity of activities) {
      addCounters(counters, processActivity(tx, userId, activity));
    }
    return counters;
  });

  res.json(result);
});

export default stravaRouter;
