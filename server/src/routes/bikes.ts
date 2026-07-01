import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index";
import { components, bikes } from "../db/schema";
import {
  bikeInsertSchema,
  bikeUpdateSchema,
  type BikeDetail,
  type BikeListItem,
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
  // Stable manual order (sort_order, set via drag-and-drop), tie-broken by
  // creation time. Activating a component no longer reorders the list — the
  // Active badge is the only indicator of which is in use.
  const rows = db
    .select()
    .from(components)
    .where(eq(components.bikeId, bikeId))
    .orderBy(asc(components.sortOrder), asc(components.createdAt))
    .all();
  return { ...bike, components: rows };
}

// GET /api/bikes
bikesRouter.get("/", (_req, res) => {
  const all = db.select().from(bikes).orderBy(desc(bikes.createdAt)).all();

  const componentCounts = db
    .select({
      bikeId: components.bikeId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(components)
    .groupBy(components.bikeId)
    .all()
    .reduce<Record<string, number>>((acc, row) => {
      acc[row.bikeId] = Number(row.count);
      return acc;
    }, {});

  const items: BikeListItem[] = all.map((b) => ({
    ...b,
    componentCount: componentCounts[b.id] ?? 0,
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
  const result = db
    .delete(bikes)
    .where(and(eq(bikes.id, id)))
    .run();
  if (result.changes === 0) throw notFound("Bike");
  res.status(204).end();
});

export default bikesRouter;
