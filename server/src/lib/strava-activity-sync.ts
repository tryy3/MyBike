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

export interface SyncCounters {
  processedActivities: number;
  skippedActivities: number;
  creditedComponents: number;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveLinkedBike(
  tx: DbTransaction,
  userId: string,
  gearId: string,
): { bikeId: string; componentCreditFrom: string } | null {
  const link = tx
    .select({
      bikeId: stravaBikes.bikeId,
      componentCreditFrom: stravaBikes.componentCreditFrom,
    })
    .from(stravaBikes)
    .where(and(eq(stravaBikes.userId, userId), eq(stravaBikes.stravaGearId, gearId)))
    .get();
  if (link) return link;

  const bike = tx
    .select({ id: bikes.id })
    .from(bikes)
    .where(and(eq(bikes.userId, userId), eq(bikes.stravaGearId, gearId)))
    .get();
  if (!bike) return null;

  return { bikeId: bike.id, componentCreditFrom: todayIsoDate() };
}

export function creditActivityToActiveComponents(
  tx: DbTransaction,
  activityId: string,
  bikeId: string,
  activity: Pick<StravaActivity, "distanceMeters" | "movingTimeMinutes">,
): number {
  const activeComponents = tx
    .select()
    .from(components)
    .where(and(eq(components.bikeId, bikeId), eq(components.isActive, true)))
    .all();

  for (const component of activeComponents) {
    tx.insert(stravaActivityComponents)
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

export function processActivity(
  tx: DbTransaction,
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

  const linked = resolveLinkedBike(tx, userId, activity.gearId);
  if (!linked) {
    return { processedActivities: 0, skippedActivities: 1, creditedComponents: 0 };
  }

  const createdActivity = tx
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
    };
  }

  const creditedComponents = creditActivityToActiveComponents(
    tx,
    createdActivity.id,
    linked.bikeId,
    activity,
  );

  return {
    processedActivities: 1,
    skippedActivities: 0,
    creditedComponents,
  };
}

function addCounters(target: SyncCounters, source: SyncCounters): void {
  target.processedActivities += source.processedActivities;
  target.skippedActivities += source.skippedActivities;
  target.creditedComponents += source.creditedComponents;
}

export function syncActivitiesForUser(userId: string, activities: StravaActivity[]): SyncCounters {
  return db.transaction((tx) => {
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
}

export function backfillComponentCredits(tx: DbTransaction, userId: string): number {
  const links = tx.select().from(stravaBikes).where(eq(stravaBikes.userId, userId)).all();

  let creditedActivities = 0;

  for (const link of links) {
    const activities = tx
      .select()
      .from(stravaActivities)
      .where(and(eq(stravaActivities.userId, userId), eq(stravaActivities.bikeId, link.bikeId)))
      .all();

    for (const activity of activities) {
      const existingJunction = tx
        .select({ id: stravaActivityComponents.id })
        .from(stravaActivityComponents)
        .where(eq(stravaActivityComponents.activityId, activity.id))
        .get();
      if (existingJunction) continue;

      creditActivityToActiveComponents(tx, activity.id, link.bikeId, activity);
      creditedActivities += 1;
    }
  }

  return creditedActivities;
}
