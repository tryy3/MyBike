import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { BikeInsert, BikeUpdate, BikeDetail, BikeListItem, ComponentFilter } from "shared";
import { db } from "../db/index.js";
import { affectedRows } from "../db/result.js";
import { bikes, components, maintenanceTasks } from "../db/schema.js";
import type { BikeRow, ComponentRow } from "../db/schema.js";
import { HttpError, notFound } from "../lib/errors.js";

function containsInsensitive(
  column: typeof components.name | typeof components.brand,
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

export async function requireBike(bikeId: string, userId: string): Promise<BikeRow> {
  const bike = await db
    .select()
    .from(bikes)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .get();
  if (!bike) throw notFound("Bike");
  return bike;
}

export async function listBikes(userId: string): Promise<BikeListItem[]> {
  const all = await db
    .select()
    .from(bikes)
    .where(eq(bikes.userId, userId))
    .orderBy(desc(bikes.createdAt))
    .all();

  const bikeIds = all.map((b) => b.id);
  const componentCounts =
    bikeIds.length === 0
      ? {}
      : (
          await db
            .select({
              bikeId: components.bikeId,
              count: sql<number>`count(*)`.as("count"),
            })
            .from(components)
            .where(inArray(components.bikeId, bikeIds))
            .groupBy(components.bikeId)
            .all()
        ).reduce<Record<string, number>>((acc, row) => {
          acc[row.bikeId] = Number(row.count);
          return acc;
        }, {});

  return all.map((b) => ({
    ...b,
    componentCount: componentCounts[b.id] ?? 0,
  }));
}

export async function getBikeDetail(bikeId: string, userId: string): Promise<BikeDetail> {
  const bike = await requireBike(bikeId, userId);
  const rows = await db
    .select()
    .from(components)
    .where(eq(components.bikeId, bikeId))
    .orderBy(asc(components.sortOrder), asc(components.createdAt))
    .all();
  return { ...bike, components: rows };
}

export async function listComponentsForBike(
  bikeId: string,
  userId: string,
  options?: { filter?: ComponentFilter },
): Promise<ComponentRow[]> {
  await requireBike(bikeId, userId);
  const filterConditions = options?.filter ? buildComponentFilterConditions(options.filter) : [];
  const rows = await db
    .select()
    .from(components)
    .where(and(eq(components.bikeId, bikeId), ...filterConditions))
    .orderBy(asc(components.sortOrder), asc(components.createdAt))
    .all();
  return rows;
}

export async function createBike(userId: string, data: BikeInsert): Promise<BikeRow> {
  const { MAINTENANCE_TEMPLATES } = await import("shared");
  return await db.transaction(async (tx) => {
    const bike = await tx
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

    const seedRows = MAINTENANCE_TEMPLATES.map((template) => ({
      bikeId: bike.id,
      source: "builtin" as const,
      templateKey: template.templateKey,
      kind: template.kind,
      title: template.title,
      description: template.description,
      componentCategory: template.componentCategory,
      triggerMode: template.triggerMode,
      distanceMeters: template.distanceMeters,
      intervalDays: template.intervalDays,
      guideUrl: template.guideUrl,
      enabled: true,
      customized: false,
      sortOrder: template.sortOrder,
    }));
    if (seedRows.length > 0) {
      await tx.insert(maintenanceTasks).values(seedRows).run();
    }

    return bike;
  });
}

export async function updateBike(
  bikeId: string,
  userId: string,
  data: BikeUpdate,
): Promise<BikeRow> {
  await requireBike(bikeId, userId);
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
  return await db
    .update(bikes)
    .set(updates)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .returning()
    .get();
}

export async function deleteBike(bikeId: string, userId: string): Promise<void> {
  const result = await db
    .delete(bikes)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .run();
  if (affectedRows(result) === 0) throw notFound("Bike");
}
