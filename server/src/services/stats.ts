import { and, eq, inArray, sql } from "drizzle-orm";
import type { BikeStats, GarageStats, RideStats } from "shared";
import { displayWear, getStravaWearByComponentId } from "../lib/component-wear.js";
import { db } from "../db/index.js";
import { bikes, components, stravaActivities } from "../db/schema.js";
import { requireBike } from "./bikes.js";

export function aggregateRideStats(
  userId: string,
  bikeIds: string[],
): Map<string, RideStats | null> {
  if (bikeIds.length === 0) return new Map();

  const rows = db
    .select({
      bikeId: stravaActivities.bikeId,
      distanceMeters: sql<number>`coalesce(sum(${stravaActivities.distanceMeters}), 0)`.as(
        "distance_meters",
      ),
      movingTimeMinutes: sql<number>`coalesce(sum(${stravaActivities.movingTimeMinutes}), 0)`.as(
        "moving_time_minutes",
      ),
      activityCount: sql<number>`count(*)`.as("activity_count"),
    })
    .from(stravaActivities)
    .where(and(eq(stravaActivities.userId, userId), inArray(stravaActivities.bikeId, bikeIds)))
    .groupBy(stravaActivities.bikeId)
    .all();

  return new Map(
    rows.map((row) => [
      row.bikeId,
      {
        distanceMeters: Number(row.distanceMeters),
        movingTimeMinutes: Number(row.movingTimeMinutes),
        activityCount: Number(row.activityCount),
      },
    ]),
  );
}

export function getGarageStats(userId: string): GarageStats {
  const userBikes = db.select({ id: bikes.id }).from(bikes).where(eq(bikes.userId, userId)).all();
  const bikeIds = userBikes.map((b) => b.id);
  const statsByBike = aggregateRideStats(userId, bikeIds);

  return {
    bikes: bikeIds.map((bikeId) => ({
      bikeId,
      rideStats: statsByBike.get(bikeId) ?? null,
    })),
  };
}

export function getRideStatsForBike(userId: string, bikeId: string): RideStats | null {
  const map = aggregateRideStats(userId, [bikeId]);
  return map.get(bikeId) ?? null;
}

export function getWearForComponent(
  bikeId: string,
  componentId: string,
  baselineDistance: number | null,
  baselineTime: number | null,
  stravaWearByComponent?: Map<string, { distanceMeters: number; movingTimeMinutes: number }>,
) {
  const wearMap = stravaWearByComponent ?? getStravaWearByComponentId(bikeId);
  const wear = displayWear(baselineDistance, baselineTime, wearMap.get(componentId));
  return {
    distanceMeters: wear.distanceMeters > 0 ? wear.distanceMeters : null,
    movingTimeMinutes: wear.movingTimeMinutes > 0 ? wear.movingTimeMinutes : null,
  };
}

export function getBikeStats(userId: string, bikeId: string): BikeStats {
  requireBike(bikeId, userId);

  const rideStats = getRideStatsForBike(userId, bikeId);
  const stravaWearByComponent = getStravaWearByComponentId(bikeId);

  const componentRows = db
    .select({
      id: components.id,
      category: components.category,
      name: components.name,
      brand: components.brand,
      model: components.model,
      baselineDistanceMeters: components.distanceMeters,
      baselineMovingTimeMinutes: components.movingTimeMinutes,
      isActive: components.isActive,
      sortOrder: components.sortOrder,
    })
    .from(components)
    .where(eq(components.bikeId, bikeId))
    .all()
    .map((row) => {
      const wear = getWearForComponent(
        bikeId,
        row.id,
        row.baselineDistanceMeters,
        row.baselineMovingTimeMinutes,
        stravaWearByComponent,
      );
      return {
        id: row.id,
        category: row.category,
        name: row.name,
        brand: row.brand,
        model: row.model,
        distanceMeters: wear.distanceMeters,
        movingTimeMinutes: wear.movingTimeMinutes,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      };
    })
    .sort((a, b) => {
      const distA = a.distanceMeters ?? 0;
      const distB = b.distanceMeters ?? 0;
      if (distB !== distA) return distB - distA;
      return a.sortOrder - b.sortOrder;
    })
    .map(({ sortOrder: _sortOrder, ...component }) => component);

  return {
    bikeId,
    rideStats,
    components: componentRows,
  };
}
