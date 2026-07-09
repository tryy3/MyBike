import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { BikeInsert, BikeUpdate, BikeDetail, BikeListItem, ComponentFilter } from "shared";
import { db } from "../db/index.js";
import { bikes, components } from "../db/schema.js";
import type { BikeRow } from "../db/schema.js";
import { HttpError, notFound } from "../lib/errors.js";

function containsInsensitive(
  column: typeof components.name | typeof components.brand | typeof components.model,
  term: string,
): SQL {
  return sql`instr(lower(${column}), lower(${term})) > 0`;
}

function buildComponentFilterConditions(filter: ComponentFilter): SQL[] {
  const conditions: SQL[] = [];

  if (filter.categories && filter.categories.length > 0) {
    conditions.push(inArray(components.category, filter.categories));
  }

  if (filter.activeOnly) {
    conditions.push(eq(components.isActive, true));
  } else if (filter.isActive !== undefined) {
    conditions.push(eq(components.isActive, filter.isActive));
  }

  if (filter.brands && filter.brands.length > 0) {
    const brandMatches = filter.brands.map(
      (brand) => sql`lower(${components.brand}) = lower(${brand})`,
    );
    conditions.push(or(...brandMatches)!);
  }

  if (filter.nameContains) {
    conditions.push(containsInsensitive(components.name, filter.nameContains));
  }

  if (filter.brandContains) {
    conditions.push(containsInsensitive(components.brand, filter.brandContains));
  }

  if (filter.modelContains) {
    conditions.push(containsInsensitive(components.model, filter.modelContains));
  }

  return conditions;
}

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
  options?: { filter?: ComponentFilter },
) {
  requireBike(bikeId, userId);
  const filterConditions = options?.filter ? buildComponentFilterConditions(options.filter) : [];
  const rows = db
    .select()
    .from(components)
    .where(and(eq(components.bikeId, bikeId), ...filterConditions))
    .orderBy(asc(components.sortOrder), asc(components.createdAt))
    .all();
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
