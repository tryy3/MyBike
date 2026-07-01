import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index";
import { componentOptions, componentSlots, bikes } from "../db/schema";
import {
  bikeInsertSchema,
  bikeUpdateSchema,
  type BikeDetail,
  type BikeListItem,
  type SlotWithOptions,
} from "shared";
import { HttpError, notFound } from "../lib/errors";
import { parseBody, parseParams } from "../lib/validation";

export const bikesRouter = Router();

function requireBike(bikeId: string) {
  const bike = db.select().from(bikes).where(eq(bikes.id, bikeId)).get();
  if (!bike) throw notFound("Bike");
  return bike;
}

function buildBikeDetail(bikeId: string): BikeDetail {
  const bike = requireBike(bikeId);
  const slots = db
    .select()
    .from(componentSlots)
    .where(eq(componentSlots.bikeId, bikeId))
    .orderBy(asc(componentSlots.createdAt))
    .all();

  const slotsWith: SlotWithOptions[] = slots.map((slot) => {
    const options = db
      .select()
      .from(componentOptions)
      .where(eq(componentOptions.slotId, slot.id))
      .orderBy(desc(componentOptions.isActive), asc(componentOptions.createdAt))
      .all();
    return { ...slot, options };
  });

  return { ...bike, slots: slotsWith };
}

// GET /api/bikes
bikesRouter.get("/", (_req, res) => {
  const all = db.select().from(bikes).orderBy(desc(bikes.createdAt)).all();

  const slotCounts = db
    .select({
      bikeId: componentSlots.bikeId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(componentSlots)
    .groupBy(componentSlots.bikeId)
    .all()
    .reduce<Record<string, number>>((acc, row) => {
      acc[row.bikeId] = Number(row.count);
      return acc;
    }, {});

  const optionCounts = db
    .select({
      bikeId: componentSlots.bikeId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(componentOptions)
    .innerJoin(
      componentSlots,
      eq(componentOptions.slotId, componentSlots.id),
    )
    .groupBy(componentSlots.bikeId)
    .all()
    .reduce<Record<string, number>>((acc, row) => {
      acc[row.bikeId] = Number(row.count);
      return acc;
    }, {});

  const items: BikeListItem[] = all.map((b) => ({
    ...b,
    slotCount: slotCounts[b.id] ?? 0,
    optionCount: optionCounts[b.id] ?? 0,
  }));

  res.json(items);
});

// POST /api/bikes
bikesRouter.post("/", (req, res) => {
  const data = parseBody(req, bikeInsertSchema);
  const created = db
    .insert(bikes)
    .values({
      name: data.name,
      brand: data.brand ?? null,
      model: data.model ?? null,
      year: data.year ?? null,
      notes: data.notes ?? null,
    })
    .returning()
    .get();
  res.status(201).json(created);
});

// GET /api/bikes/:id
bikesRouter.get("/:id", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  res.json(buildBikeDetail(id));
});

// PUT /api/bikes/:id
bikesRouter.put("/:id", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  requireBike(id);
  const data = parseBody(req, bikeUpdateSchema);
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
  const updated = db
    .update(bikes)
    .set(updates)
    .where(eq(bikes.id, id))
    .returning()
    .get();
  res.json(updated);
});

// DELETE /api/bikes/:id
bikesRouter.delete("/:id", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  const result = db.delete(bikes).where(and(eq(bikes.id, id))).run();
  if (result.changes === 0) throw notFound("Bike");
  res.status(204).end();
});

export default bikesRouter;