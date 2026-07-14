import { and, eq } from "drizzle-orm";
import {
  bikes,
  components,
  stravaActivities,
  stravaActivityComponents,
  stravaBikes,
} from "../db/schema.js";
import { db } from "../db/index.js";
import { activityDateOnOrAfterCreditFrom } from "./wear-baseline.js";
import type { StravaActivity } from "./strava-client.js";

export interface SyncSkipReasons {
  noGear: number;
  duplicate: number;
  noLinkedBike: number;
  beforeCreditDate: number;
}

export interface SyncCounters {
  processedActivities: number;
  skippedActivities: number;
  creditedComponents: number;
  skipReasons: SyncSkipReasons;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function emptySkipReasons(): SyncSkipReasons {
  return { noGear: 0, duplicate: 0, noLinkedBike: 0, beforeCreditDate: 0 };
}

export function emptySyncCounters(): SyncCounters {
  return {
    processedActivities: 0,
    skippedActivities: 0,
    creditedComponents: 0,
    skipReasons: emptySkipReasons(),
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resolveLinkedBike(
  tx: DbTransaction,
  userId: string,
  gearId: string,
): Promise<{ bikeId: string; componentCreditFrom: string } | null> {
  const link = await tx
    .select({
      bikeId: stravaBikes.bikeId,
      componentCreditFrom: stravaBikes.componentCreditFrom,
    })
    .from(stravaBikes)
    .where(and(eq(stravaBikes.userId, userId), eq(stravaBikes.stravaGearId, gearId)))
    .get();
  if (link) return link;

  const bike = await tx
    .select({ id: bikes.id })
    .from(bikes)
    .where(and(eq(bikes.userId, userId), eq(bikes.stravaGearId, gearId)))
    .get();
  if (!bike) return null;

  return { bikeId: bike.id, componentCreditFrom: todayIsoDate() };
}

export async function creditActivityToActiveComponents(
  tx: DbTransaction,
  activityId: string,
  bikeId: string,
  activity: Pick<StravaActivity, "distanceMeters" | "movingTimeMinutes">,
): Promise<number> {
  const activeComponents = await tx
    .select()
    .from(components)
    .where(and(eq(components.bikeId, bikeId), eq(components.isActive, true)))
    .all();

  for (const component of activeComponents) {
    await tx
      .insert(stravaActivityComponents)
      .values({
        activityId,
        componentId: component.id,
        distanceMeters: activity.distanceMeters,
        movingTimeMinutes: activity.movingTimeMinutes,
      })
      .run();
  }

  return activeComponents.length;
}

export async function processActivity(
  tx: DbTransaction,
  userId: string,
  activity: StravaActivity,
): Promise<SyncCounters> {
  if (!activity.gearId) {
    return {
      processedActivities: 0,
      skippedActivities: 1,
      creditedComponents: 0,
      skipReasons: { noGear: 1, duplicate: 0, noLinkedBike: 0, beforeCreditDate: 0 },
    };
  }

  const existing = await tx
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
    return {
      processedActivities: 0,
      skippedActivities: 1,
      creditedComponents: 0,
      skipReasons: { noGear: 0, duplicate: 1, noLinkedBike: 0, beforeCreditDate: 0 },
    };
  }

  const linked = await resolveLinkedBike(tx, userId, activity.gearId);
  if (!linked) {
    return {
      processedActivities: 0,
      skippedActivities: 1,
      creditedComponents: 0,
      skipReasons: { noGear: 0, duplicate: 0, noLinkedBike: 1, beforeCreditDate: 0 },
    };
  }

  const createdActivity = await tx
    .insert(stravaActivities)
    .values({
      userId,
      bikeId: linked.bikeId,
      stravaActivityId: activity.stravaActivityId,
      stravaGearId: activity.gearId,
      distanceMeters: activity.distanceMeters,
      movingTimeMinutes: activity.movingTimeMinutes,
      startDate: activity.startDate,
    })
    .returning()
    .get();

  if (!activityDateOnOrAfterCreditFrom(activity.startDate, linked.componentCreditFrom)) {
    return {
      processedActivities: 1,
      skippedActivities: 0,
      creditedComponents: 0,
      skipReasons: { noGear: 0, duplicate: 0, noLinkedBike: 0, beforeCreditDate: 1 },
    };
  }

  const creditedComponents = await creditActivityToActiveComponents(
    tx,
    createdActivity.id,
    linked.bikeId,
    activity,
  );

  return {
    processedActivities: 1,
    skippedActivities: 0,
    creditedComponents,
    skipReasons: emptySkipReasons(),
  };
}

export function mergeSyncCounters(target: SyncCounters, source: SyncCounters): void {
  target.processedActivities += source.processedActivities;
  target.skippedActivities += source.skippedActivities;
  target.creditedComponents += source.creditedComponents;
  target.skipReasons.noGear += source.skipReasons.noGear;
  target.skipReasons.duplicate += source.skipReasons.duplicate;
  target.skipReasons.noLinkedBike += source.skipReasons.noLinkedBike;
  target.skipReasons.beforeCreditDate += source.skipReasons.beforeCreditDate;
}

export async function syncActivitiesForUser(
  userId: string,
  activities: StravaActivity[],
): Promise<SyncCounters> {
  return db.transaction(async (tx) => {
    const counters = emptySyncCounters();
    for (const activity of activities) {
      mergeSyncCounters(counters, await processActivity(tx, userId, activity));
    }
    return counters;
  });
}

export async function backfillComponentCredits(tx: DbTransaction, userId: string): Promise<number> {
  const links = await tx.select().from(stravaBikes).where(eq(stravaBikes.userId, userId)).all();

  let creditedActivities = 0;

  for (const link of links) {
    const activities = await tx
      .select()
      .from(stravaActivities)
      .where(and(eq(stravaActivities.userId, userId), eq(stravaActivities.bikeId, link.bikeId)))
      .all();

    for (const activity of activities) {
      const existingJunction = await tx
        .select({ id: stravaActivityComponents.id })
        .from(stravaActivityComponents)
        .where(eq(stravaActivityComponents.activityId, activity.id))
        .get();
      if (existingJunction) continue;

      await creditActivityToActiveComponents(tx, activity.id, link.bikeId, activity);
      creditedActivities += 1;
    }
  }

  return creditedActivities;
}
