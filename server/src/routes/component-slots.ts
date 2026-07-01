import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { componentSlots, bikes } from "../db/schema";
import { componentSlotInsertSchema, componentSlotUpdateSchema } from "shared";
import { notFound } from "../lib/errors";
import { parseBody, parseParams } from "../lib/validation";

export const slotsRouter = Router({ mergeParams: true });

function requireBikeExists(bikeId: string) {
  const bike = db.select().from(bikes).where(eq(bikes.id, bikeId)).get();
  if (!bike) throw notFound("Bike");
  return bike;
}

function requireSlot(slotId: string) {
  const slot = db
    .select()
    .from(componentSlots)
    .where(eq(componentSlots.id, slotId))
    .get();
  if (!slot) throw notFound("Component slot");
  return slot;
}

// POST /api/bikes/:bikeId/slots
slotsRouter.post("/", (req, res) => {
  const { bikeId } = parseParams(req, ["bikeId"]);
  requireBikeExists(bikeId);
  const data = parseBody(req, componentSlotInsertSchema);
  const created = db
    .insert(componentSlots)
    .values({ bikeId, name: data.name })
    .returning()
    .get();
  res.status(201).json(created);
});

// PUT /api/slots/:id  (mounted at /api/slots)
slotsRouter.put("/:id", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  requireSlot(id);
  const data = parseBody(req, componentSlotUpdateSchema);
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (Object.keys(updates).length === 0) {
    const row = db
      .select()
      .from(componentSlots)
      .where(eq(componentSlots.id, id))
      .get();
    res.json(row);
    return;
  }
  const updated = db
    .update(componentSlots)
    .set(updates)
    .where(eq(componentSlots.id, id))
    .returning()
    .get();
  res.json(updated);
});

// DELETE /api/slots/:id
slotsRouter.delete("/:id", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  const result = db.delete(componentSlots).where(eq(componentSlots.id, id)).run();
  if (result.changes === 0) throw notFound("Component slot");
  // Cascade delete of options handled by FK policy.
  res.status(204).end();
});

export default slotsRouter;