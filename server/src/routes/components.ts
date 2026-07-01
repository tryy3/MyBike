import { Router } from "express";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db/index";
import { bikes, components } from "../db/schema";
import {
  componentInsertSchema,
  componentUpdateSchema,
} from "shared";
import { notFound } from "../lib/errors";
import { parseBody, parseParams } from "../lib/validation";

export const componentsRouter = Router({ mergeParams: true });

function requireBikeExists(bikeId: string) {
  const bike = db.select().from(bikes).where(eq(bikes.id, bikeId)).get();
  if (!bike) throw notFound("Bike");
  return bike;
}

function requireComponentExists(componentId: string) {
  const component = db
    .select()
    .from(components)
    .where(eq(components.id, componentId))
    .get();
  if (!component) throw notFound("Component");
  return component;
}

// POST /api/bikes/:bikeId/components
componentsRouter.post("/", (req, res) => {
  const { bikeId } = parseParams(req, ["bikeId"]);
  requireBikeExists(bikeId);
  const data = parseBody(req, componentInsertSchema);
  const existingCount = db
    .select({ c: components.id })
    .from(components)
    .where(
      and(eq(components.bikeId, bikeId), eq(components.category, data.category)),
    )
    .all().length;
  // First component in a (bike, category) is auto-activated so a category
  // always has exactly one active component once it has any at all.
  const isActive = existingCount === 0 ? true : data.isActive;
  const created = db
    .insert(components)
    .values({
      bikeId,
      category: data.category,
      name: data.name,
      brand: data.brand ?? null,
      model: data.model ?? null,
      notes: data.notes ?? null,
      isActive,
    })
    .returning()
    .get();
  res.status(201).json(created);
});

// PUT /api/components/:id  (mounted at /api/components)
componentsRouter.put("/:id", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  requireComponentExists(id);
  const data = parseBody(req, componentUpdateSchema);
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.brand !== undefined) updates.brand = data.brand ?? null;
  if (data.model !== undefined) updates.model = data.model ?? null;
  if (data.notes !== undefined) updates.notes = data.notes ?? null;
  // category and is_active are managed elsewhere; ignore them here.
  if (Object.keys(updates).length === 0) {
    const row = db
      .select()
      .from(components)
      .where(eq(components.id, id))
      .get();
    res.json(row);
    return;
  }
  const updated = db
    .update(components)
    .set(updates)
    .where(eq(components.id, id))
    .returning()
    .get();
  res.json(updated);
});

// DELETE /api/components/:id
componentsRouter.delete("/:id", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  const existing = requireComponentExists(id);
  // Delete within a transaction so we can reassign the active flag atomically.
  db.transaction((tx) => {
    const result = tx
      .delete(components)
      .where(eq(components.id, id))
      .run();
    if (result.changes === 0) throw notFound("Component");
    if (existing.isActive) {
      // Reassign active flag to the oldest remaining component in the same
      // (bike, category), if any.
      const oldest = tx
        .select()
        .from(components)
        .where(
          and(
            eq(components.bikeId, existing.bikeId),
            eq(components.category, existing.category),
          ),
        )
        .orderBy(asc(components.createdAt))
        .get();
      if (oldest) {
        tx.update(components)
          .set({ isActive: true })
          .where(eq(components.id, oldest.id))
          .run();
      }
    }
  });
  res.status(204).end();
});

// PATCH /api/components/:id/activate — set this component active, others in the
// same (bike, category) inactive.
componentsRouter.patch("/:id/activate", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  const component = requireComponentExists(id);
  db.transaction((tx) => {
    // Deactivate all other components in the same (bike, category).
    tx.update(components)
      .set({ isActive: false })
      .where(
        and(
          eq(components.bikeId, component.bikeId),
          eq(components.category, component.category),
          ne(components.id, id),
        ),
      )
      .run();
    // Activate the chosen one.
    tx.update(components)
      .set({ isActive: true })
      .where(eq(components.id, id))
      .run();
  });
  const updated = db
    .select()
    .from(components)
    .where(eq(components.id, id))
    .get();
  res.json(updated);
});

export default componentsRouter;