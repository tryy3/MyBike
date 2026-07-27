import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  normalizePropertiesForWrite,
  type ComponentInsert,
  type ComponentProperties,
  type ComponentReorder,
  type ComponentUpdate,
} from "shared";
import { db } from "../db/index.js";
import { affectedRows } from "../db/result.js";
import { bikes, components } from "../db/schema.js";
import type { ComponentRow } from "../db/schema.js";
import { badRequest, HttpError, notFound } from "../lib/errors.js";
import { requireBike } from "./bikes.js";

function optionalComponentFields(data: {
  distanceMeters?: number | null;
  movingTimeMinutes?: number | null;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  purchaseStore?: string | null;
}) {
  return {
    distanceMeters: data.distanceMeters ?? null,
    movingTimeMinutes: data.movingTimeMinutes ?? null,
    purchaseDate: data.purchaseDate ?? null,
    purchaseCost: data.purchaseCost ?? null,
    purchaseStore: data.purchaseStore ?? null,
  };
}

function propertiesForStorage(properties: ComponentProperties): ComponentProperties | null {
  return Object.keys(properties).length === 0 ? null : properties;
}

export async function requireComponent(componentId: string, userId: string): Promise<ComponentRow> {
  const row = await db
    .select({ component: components })
    .from(components)
    .innerJoin(bikes, eq(components.bikeId, bikes.id))
    .where(and(eq(components.id, componentId), eq(bikes.userId, userId)))
    .get();
  if (!row) throw notFound("Component");
  return row.component;
}

export async function createComponent(
  bikeId: string,
  userId: string,
  data: ComponentInsert,
): Promise<ComponentRow> {
  await requireBike(bikeId, userId);
  const existingCount = (
    await db
      .select({ c: components.id })
      .from(components)
      .where(and(eq(components.bikeId, bikeId), eq(components.category, data.category)))
      .all()
  ).length;
  const isActive = existingCount === 0 ? true : data.isActive;
  return await db.transaction(async (tx) => {
    if (isActive && existingCount > 0) {
      await tx
        .update(components)
        .set({ isActive: false })
        .where(and(eq(components.bikeId, bikeId), eq(components.category, data.category)))
        .run();
    }
    const maxOrder = await tx
      .select({
        max: sql<number | null>`max(${components.sortOrder})`.as("max"),
      })
      .from(components)
      .where(and(eq(components.bikeId, bikeId), eq(components.category, data.category)))
      .get();
    const sortOrder = (maxOrder?.max ?? -1) + 1;
    return await tx
      .insert(components)
      .values({
        bikeId,
        category: data.category,
        name: data.name,
        brand: data.brand ?? null,
        model: data.model ?? null,
        notes: data.notes ?? null,
        properties: propertiesForStorage(data.properties),
        ...optionalComponentFields(data),
        isActive,
        sortOrder,
      })
      .returning()
      .get();
  });
}

export async function updateComponent(
  componentId: string,
  userId: string,
  data: ComponentUpdate,
): Promise<ComponentRow> {
  const existing = await requireComponent(componentId, userId);
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.brand !== undefined) updates.brand = data.brand ?? null;
  if (data.model !== undefined) updates.model = data.model ?? null;
  if (data.notes !== undefined) updates.notes = data.notes ?? null;
  if (data.distanceMeters !== undefined) updates.distanceMeters = data.distanceMeters ?? null;
  if (data.movingTimeMinutes !== undefined)
    updates.movingTimeMinutes = data.movingTimeMinutes ?? null;
  if (data.purchaseDate !== undefined) updates.purchaseDate = data.purchaseDate ?? null;
  if (data.purchaseCost !== undefined) updates.purchaseCost = data.purchaseCost ?? null;
  if (data.purchaseStore !== undefined) updates.purchaseStore = data.purchaseStore ?? null;
  if (data.properties !== undefined) {
    const normalized = normalizePropertiesForWrite(existing.category, data.properties);
    updates.properties = propertiesForStorage(normalized);
  }
  if (Object.keys(updates).length === 0) {
    return existing;
  }
  return await db
    .update(components)
    .set(updates)
    .where(eq(components.id, componentId))
    .returning()
    .get();
}

export async function deleteComponent(componentId: string, userId: string): Promise<void> {
  const existing = await requireComponent(componentId, userId);
  await db.transaction(async (tx) => {
    const result = await tx.delete(components).where(eq(components.id, componentId)).run();
    if (affectedRows(result) === 0) throw notFound("Component");
    if (existing.isActive) {
      const oldest = await tx
        .select()
        .from(components)
        .where(
          and(
            eq(components.bikeId, existing.bikeId),
            eq(components.category, existing.category),
            eq(components.isArchived, false),
          ),
        )
        .orderBy(asc(components.createdAt))
        .get();
      if (oldest) {
        await tx
          .update(components)
          .set({ isActive: true })
          .where(eq(components.id, oldest.id))
          .run();
      }
    }
  });
}

export async function activateComponent(
  componentId: string,
  userId: string,
): Promise<ComponentRow> {
  const component = await requireComponent(componentId, userId);
  if (component.isArchived) {
    throw badRequest("Archived components cannot be activated; unarchive first", {
      code: "COMPONENT_ARCHIVED",
    });
  }
  await db.transaction(async (tx) => {
    await tx
      .update(components)
      .set({ isActive: false })
      .where(
        and(
          eq(components.bikeId, component.bikeId),
          eq(components.category, component.category),
          ne(components.id, componentId),
        ),
      )
      .run();
    await tx.update(components).set({ isActive: true }).where(eq(components.id, componentId)).run();
  });
  const updated = await db.select().from(components).where(eq(components.id, componentId)).get();
  if (!updated) throw notFound("Component");
  return updated;
}

export async function archiveComponent(componentId: string, userId: string): Promise<ComponentRow> {
  const component = await requireComponent(componentId, userId);
  if (component.isActive) {
    throw badRequest("Active components cannot be archived; activate another part first", {
      code: "COMPONENT_ACTIVE",
    });
  }
  if (component.isArchived) {
    throw badRequest("Component is already archived", { code: "COMPONENT_ALREADY_ARCHIVED" });
  }
  const updated = await db
    .update(components)
    .set({ isArchived: true })
    .where(eq(components.id, componentId))
    .returning()
    .get();
  if (!updated) throw notFound("Component");
  return updated;
}

export async function unarchiveComponent(
  componentId: string,
  userId: string,
): Promise<ComponentRow> {
  const component = await requireComponent(componentId, userId);
  if (!component.isArchived) {
    throw badRequest("Component is not archived", { code: "COMPONENT_NOT_ARCHIVED" });
  }
  const updated = await db
    .update(components)
    .set({ isArchived: false, isActive: false })
    .where(eq(components.id, componentId))
    .returning()
    .get();
  if (!updated) throw notFound("Component");
  return updated;
}

export async function reorderComponents(
  bikeId: string,
  userId: string,
  data: ComponentReorder,
): Promise<void> {
  await requireBike(bikeId, userId);
  const rows = await db
    .select({ id: components.id })
    .from(components)
    .where(and(eq(components.bikeId, bikeId), eq(components.category, data.category)))
    .all();
  const existingIds = new Set(rows.map((r) => r.id));
  const orderedSet = new Set(data.orderedIds);
  if (existingIds.size !== orderedSet.size || rows.length !== data.orderedIds.length) {
    throw new HttpError(
      400,
      "orderedIds must contain each component of this (bike, category) exactly once",
    );
  }
  for (const id of data.orderedIds) {
    if (!existingIds.has(id)) {
      throw new HttpError(400, `Component ${id} does not belong to this (bike, category)`);
    }
  }
  await db.transaction(async (tx) => {
    for (let index = 0; index < data.orderedIds.length; index++) {
      const id = data.orderedIds[index];
      await tx.update(components).set({ sortOrder: index }).where(eq(components.id, id)).run();
    }
  });
}
