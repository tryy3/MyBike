import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BikeStats, GarageStats } from "shared";
import { displayWear, getStravaWearByComponentId } from "../lib/component-wear.js";
import { db } from "../db/index.js";
import { bikes, components, stravaActivities } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import { getAuthContext, requireAuth } from "../lib/require-auth.js";
import { parseParams } from "../lib/validation.js";

const statsRouter = Router();
statsRouter.use(requireAuth);

function aggregateRideStats(userId: string, bikeIds: string[]) {
  if (bikeIds.length === 0) return new Map<string, GarageStats["bikes"][number]["rideStats"]>();

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

statsRouter.get("/garage", (req, res) => {
  const { userId } = getAuthContext(req);
  const userBikes = db.select({ id: bikes.id }).from(bikes).where(eq(bikes.userId, userId)).all();
  const bikeIds = userBikes.map((b) => b.id);
  const statsByBike = aggregateRideStats(userId, bikeIds);

  const payload: GarageStats = {
    bikes: bikeIds.map((bikeId) => ({
      bikeId,
      rideStats: statsByBike.get(bikeId) ?? null,
    })),
  };

  res.json(payload);
});

function requireBike(bikeId: string, userId: string) {
  const bike = db
    .select({ id: bikes.id })
    .from(bikes)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .get();
  if (!bike) throw notFound("Bike");
  return bike;
}

statsRouter.get("/bikes/:bikeId", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  requireBike(bikeId, userId);

  const rideStatsMap = aggregateRideStats(userId, [bikeId]);
  const rideStats = rideStatsMap.get(bikeId) ?? null;
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
      const wear = displayWear(
        row.baselineDistanceMeters,
        row.baselineMovingTimeMinutes,
        stravaWearByComponent.get(row.id),
      );
      return {
        id: row.id,
        category: row.category,
        name: row.name,
        brand: row.brand,
        model: row.model,
        distanceMeters: wear.distanceMeters > 0 ? wear.distanceMeters : null,
        movingTimeMinutes: wear.movingTimeMinutes > 0 ? wear.movingTimeMinutes : null,
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

  const payload: BikeStats = {
    bikeId,
    rideStats,
    components: componentRows,
  };

  res.json(payload);
});

export default statsRouter;
