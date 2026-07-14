import { categoryLabel } from "shared";
import type { BikeListItem } from "shared";
import type { BikeRow, ComponentRow } from "../db/schema.js";
import { getRideStatsForBike, getWearForComponent } from "../services/stats.js";

export function serializeBikeBase(
  bike: BikeRow | BikeListItem,
  rideStats?: { distanceMeters: number; movingTimeMinutes: number; activityCount: number } | null,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: bike.id,
    name: bike.name,
    brand: bike.brand,
    model: bike.model,
    year: bike.year,
    notes: bike.notes,
    stravaGearId: bike.stravaGearId,
    createdAt: bike.createdAt,
    updatedAt: bike.updatedAt,
  };

  if ("componentCount" in bike) {
    base.componentCount = bike.componentCount;
  }

  if (rideStats !== undefined) {
    base.rideStats = rideStats;
  }

  return base;
}

export function serializeComponent(row: ComponentRow): Record<string, unknown> {
  return {
    id: row.id,
    bikeId: row.bikeId,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    name: row.name,
    brand: row.brand,
    model: row.model,
    notes: row.notes,
    isActive: row.isActive,
    purchaseDate: row.purchaseDate,
    purchaseStore: row.purchaseStore,
    purchaseCost: row.purchaseCost,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    wear: getWearForComponent(row.bikeId, row.id, row.distanceMeters, row.movingTimeMinutes),
  };
}

export async function withRideStatsIfNeeded(
  userId: string,
  bike: BikeRow | BikeListItem,
  fields: string[],
): Promise<Record<string, unknown>> {
  const wantsRideStats = fields.some(
    (field) => field === "rideStats" || field.startsWith("rideStats."),
  );
  const rideStats = wantsRideStats ? getRideStatsForBike(userId, bike.id) : undefined;
  return serializeBikeBase(bike, rideStats);
}
