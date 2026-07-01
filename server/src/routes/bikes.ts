import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index";
import { components, bikes } from "../db/schema";
import {
  bikeInsertSchema,
  bikeUpdateSchema,
  type BikeDetail,
  type BikeListItem,
} from "shared";
import { HttpError, notFound } from "../lib/errors";
import { requireAuth, getAuthContext } from "../lib/require-auth";
import { parseBody, parseParams } from "../lib/validation";

export const bikesRouter = Router();

bikesRouter.use(requireAuth);

function requireBike(bikeId: string, userId: string) {
  const bike = db
    .select()
    .from(bikes)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .get();
  if (!bike) throw notFound("Bike");
  return bike;
}

function buildBikeDetail(bikeId: string, userId: string): BikeDetail {
  const bike = requireBike(bikeId, userId);
  const rows = db
    .select()
    .from(components)
    .where(eq(components.bikeId, bikeId))
    .orderBy(asc(components.sortOrder), asc(components.createdAt))
    .all();
  return { ...bike, components: rows };
}

// GET /api/bikes
bikesRouter.get("/", (req, res) => {
  const { userId } = getAuthContext(req);
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

  const items: BikeListItem[] = all.map((b) => ({
    ...b,
    componentCount: componentCounts[b.id] ?? 0,
  }));

  res.json(items);
});

// POST /api/bikes
bikesRouter.post("/", (req, res) => {
  const { userId } = getAuthContext(req);
  const data = parseBody(req, bikeInsertSchema);
  const created = db
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
  res.status(201).json(created);
});

// GET /api/bikes/:id
bikesRouter.get("/:id", (req, res) => {
  const { userId } = getAuthContext(req);
  const { id } = parseParams(req, ["id"]);
  res.json(buildBikeDetail(id, userId));
});

// PUT /api/bikes/:id
bikesRouter.put("/:id", (req, res) => {
  const { userId } = getAuthContext(req);
  const { id } = parseParams(req, ["id"]);
  requireBike(id, userId);
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
    .where(and(eq(bikes.id, id), eq(bikes.userId, userId)))
    .returning()
    .get();
  res.json(updated);
});

// DELETE /api/bikes/:id
bikesRouter.delete("/:id", (req, res) => {
  const { userId } = getAuthContext(req);
  const { id } = parseParams(req, ["id"]);
  const result = db
    .delete(bikes)
    .where(and(eq(bikes.id, id), eq(bikes.userId, userId)))
    .run();
  if (result.changes === 0) throw notFound("Bike");
  res.status(204).end();
});

export default bikesRouter;
