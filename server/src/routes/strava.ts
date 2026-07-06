import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { bikes, components, stravaBikes } from "../db/schema.js";
import type { BikeRow } from "../db/schema.js";
import { db } from "../db/index.js";
import { badRequest, notFound } from "../lib/errors.js";
import { getAuthContext, requireAuth } from "../lib/require-auth.js";
import { parseBody } from "../lib/validation.js";
import {
  buildStravaAuthorizationUrl,
  exchangeStravaCode,
  fetchStravaActivities,
  fetchStravaAthleteBikes,
  fetchStravaGearName,
  type StravaActivity,
} from "../lib/strava-client.js";
import { isStravaOAuthConfigured } from "../lib/strava-oauth.js";
import { getSyncAfterSeconds, markSyncedNow } from "../lib/strava-sync-state.js";
import { disconnectStravaUser, upsertStravaAccount } from "../lib/strava-account.js";
import { detectImportDrift } from "../lib/strava-import-drift.js";
import { findStravaAccount, getStravaAccessToken } from "../lib/strava-token.js";
import {
  backfillComponentCredits,
  processActivity,
  type SyncCounters,
} from "../lib/strava-activity-sync.js";
import { drainWebhookEventsBestEffort } from "../lib/strava-webhook-poller.js";
import { stravaImportCommitSchema, type StravaImportDecision } from "shared";

const OAUTH_STATE_COOKIE = "mybike_strava_state";

export const stravaRouter = Router();

stravaRouter.get("/config", (_req, res) => {
  res.json({ configured: isStravaOAuthConfigured() });
});

interface GearAggregate {
  gearId: string;
  stravaBikeName: string;
  distanceMeters: number;
  movingTimeMinutes: number;
  activityCount: number;
  activities: StravaActivity[];
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

stravaRouter.use(requireAuth);

function clientUrl(): string {
  return process.env.CLIENT_URL ?? "http://localhost:5173";
}

function oauthCookieSuffix(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
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
  tx: DbTransaction,
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function upsertStravaBikeLink(
  tx: DbTransaction,
  userId: string,
  bikeId: string,
  stravaGearId: string,
  creditHistoricalComponents: boolean,
): void {
  const creditFrom = creditHistoricalComponents ? "1970-01-01" : todayIsoDate();
  const byBike = tx
    .select({ id: stravaBikes.id })
    .from(stravaBikes)
    .where(and(eq(stravaBikes.userId, userId), eq(stravaBikes.bikeId, bikeId)))
    .get();
  const byGear = tx
    .select({ id: stravaBikes.id, bikeId: stravaBikes.bikeId })
    .from(stravaBikes)
    .where(and(eq(stravaBikes.userId, userId), eq(stravaBikes.stravaGearId, stravaGearId)))
    .get();

  if (byGear && byGear.bikeId !== bikeId) {
    throw badRequest("That Strava bike is already linked to another bike");
  }

  if (byBike) {
    tx.update(stravaBikes)
      .set({ stravaGearId, componentCreditFrom: creditFrom })
      .where(eq(stravaBikes.id, byBike.id))
      .run();
    return;
  }

  tx.insert(stravaBikes)
    .values({
      userId,
      bikeId,
      stravaGearId,
      componentCreditFrom: creditFrom,
    })
    .run();
}

function addCounters(target: SyncCounters, source: SyncCounters): void {
  target.processedActivities += source.processedActivities;
  target.skippedActivities += source.skippedActivities;
  target.creditedComponents += source.creditedComponents;
}

async function loadAggregates(userId: string): Promise<Map<string, GearAggregate>> {
  const token = await getStravaAccessToken(userId);
  const activities = await fetchStravaActivities(token);
  const aggregates = aggregateActivities(activities);

  const gearNames = new Map<string, string>();
  const needsNameResolution = [...aggregates.values()].some((aggregate) =>
    needsGearLookup(aggregate, gearNames),
  );
  if (!needsNameResolution) return aggregates;

  const athleteBikes = await fetchStravaAthleteBikes(token);
  for (const bike of athleteBikes) {
    gearNames.set(bike.id, bike.name);
  }
  applyGearNames(aggregates, gearNames);
  await resolveMissingGearNames(token, aggregates, gearNames);
  return aggregates;
}

stravaRouter.get("/status", (req, res) => {
  const { userId } = getAuthContext(req);
  const row = findStravaAccount(userId);
  const linkedBikes = db
    .select({ id: stravaBikes.id })
    .from(stravaBikes)
    .where(eq(stravaBikes.userId, userId))
    .all().length;

  res.json({
    connected: !!row?.accessToken,
    linkedBikes,
    needsReconnect: !!row && !row.accessToken,
  });
});

stravaRouter.get("/connect", (req, res) => {
  const state = crypto.randomUUID();
  res.setHeader(
    "Set-Cookie",
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/strava; Max-Age=600${oauthCookieSuffix()}`,
  );
  res.json({ authorizationUrl: buildStravaAuthorizationUrl(state) });
});

stravaRouter.get("/callback", async (req, res) => {
  if (req.query.error === "access_denied") {
    res.redirect(`${clientUrl()}/settings/integrations?strava=denied`);
    return;
  }

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
    `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/strava; Max-Age=0${oauthCookieSuffix()}`,
  );
  res.redirect(`${clientUrl()}/settings/integrations`);
});

stravaRouter.post("/disconnect", async (req, res) => {
  const { userId } = getAuthContext(req);
  await disconnectStravaUser(userId);
  res.json({ disconnected: true });
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
  const warnings = detectImportDrift(data.previewSnapshot, aggregates, data.decisions);
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
        upsertStravaBikeLink(
          tx,
          userId,
          bike.id,
          decision.gearId,
          data.creditHistoricalComponents ?? false,
        );
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
        upsertStravaBikeLink(
          tx,
          userId,
          bike.id,
          decision.gearId,
          data.creditHistoricalComponents ?? false,
        );
        counters.created += 1;
      }

      for (const activity of aggregate.activities) {
        addCounters(counters, processActivity(tx, userId, activity));
      }
    }

    return counters;
  });

  res.json({ ...result, warnings: warnings.length > 0 ? warnings : undefined });
});

stravaRouter.post("/sync", async (req, res) => {
  const { userId } = getAuthContext(req);
  const webhook = await drainWebhookEventsBestEffort();
  const token = await getStravaAccessToken(userId);
  const afterSeconds = getSyncAfterSeconds(userId);
  const activities = await fetchStravaActivities(token, { afterSeconds });
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
  markSyncedNow(userId);

  res.json({ ...result, webhook });
});

stravaRouter.post("/backfill-components", (req, res) => {
  const { userId } = getAuthContext(req);
  const creditedActivities = db.transaction((tx) => backfillComponentCredits(tx, userId));
  res.json({ creditedActivities });
});

export default stravaRouter;
