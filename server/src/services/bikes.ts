import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { BikeInsert, BikeUpdate, BikeDetail, BikeListItem } from "shared";
import { db } from "../db/index.js";
import { bikes, components } from "../db/schema.js";
import type { BikeRow } from "../db/schema.js";
import { HttpError, notFound } from "../lib/errors.js";

export function requireBike(bikeId: string, userId: string): BikeRow {
  const bike = db
    .select()
    .from(bikes)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .get();
  if (!bike) throw notFound("Bike");
  return bike;
}

export function listBikes(userId: string): BikeListItem[] {
  const all = db
    .select()
    .from(bikes)
    .where(eq(bikes.userId, userId))
    .orderBy(desc(bikes.createdAt))
    .all();

  const bikeIds = all.map((b) => b.id);
  const componentCounts =
    bikeIds.length === 0
      ? {}
      : db
          .select({
            bikeId: components.bikeId,
            count: sql<number>`count(*)`.as("count"),
          })
          .from(components)
          .where(inArray(components.bikeId, bikeIds))
          .groupBy(components.bikeId)
          .all()
          .reduce<Record<string, number>>((acc, row) => {
            acc[row.bikeId] = Number(row.count);
            return acc;
          }, {});

  return all.map((b) => ({
    ...b,
    componentCount: componentCounts[b.id] ?? 0,
  }));
}

export function getBikeDetail(bikeId: string, userId: string): BikeDetail {
  const bike = requireBike(bikeId, userId);
  const rows = db
    .select()
    .from(components)
    .where(eq(components.bikeId, bikeId))
    .orderBy(asc(components.sortOrder), asc(components.createdAt))
    .all();
  return { ...bike, components: rows };
}

export function listComponentsForBike(
  bikeId: string,
  userId: string,
  options?: { activeOnly?: boolean },
) {
  requireBike(bikeId, userId);
  const rows = db
    .select()
    .from(components)
    .where(eq(components.bikeId, bikeId))
    .orderBy(asc(components.sortOrder), asc(components.createdAt))
    .all();
  if (options?.activeOnly) {
    return rows.filter((c) => c.isActive);
  }
  return rows;
}

export function createBike(userId: string, data: BikeInsert): BikeRow {
  return db
    .insert(bikes)
    .values({
      userId,
      name: data.name,
      brand: data.brand ?? null,
      model: data.model ?? null,
      year: data.year ?? null,
      notes: data.notes ?? null,
    })
    .returning()
    .get();
}

export function updateBike(bikeId: string, userId: string, data: BikeUpdate): BikeRow {
  requireBike(bikeId, userId);
  const updates = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.brand !== undefined ? { brand: data.brand ?? null } : {}),
    ...(data.model !== undefined ? { model: data.model ?? null } : {}),
    ...(data.year !== undefined ? { year: data.year ?? null } : {}),
    ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
  };
  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, "No fields to update");
  }
  return db
    .update(bikes)
    .set(updates)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .returning()
    .get();
}

export function deleteBike(bikeId: string, userId: string): void {
  const result = db
    .delete(bikes)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .run();
  if (result.changes === 0) throw notFound("Bike");
}
