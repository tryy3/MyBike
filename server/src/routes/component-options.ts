import { Router } from "express";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db/index";
import { componentOptions, componentSlots } from "../db/schema";
import {
  componentOptionInsertSchema,
  componentOptionUpdateSchema,
} from "shared";
import { notFound } from "../lib/errors";
import { parseBody, parseParams } from "../lib/validation";

export const optionsRouter = Router({ mergeParams: true });

function requireSlotExists(slotId: string) {
  const slot = db
    .select()
    .from(componentSlots)
    .where(eq(componentSlots.id, slotId))
    .get();
  if (!slot) throw notFound("Component slot");
  return slot;
}

function requireOptionExists(optionId: string) {
  const option = db
    .select()
    .from(componentOptions)
    .where(eq(componentOptions.id, optionId))
    .get();
  if (!option) throw notFound("Component option");
  return option;
}

// POST /api/slots/:slotId/options
optionsRouter.post("/", (req, res) => {
  const { slotId } = parseParams(req, ["slotId"]);
  requireSlotExists(slotId);
  const data = parseBody(req, componentOptionInsertSchema);
  const existingCount = db
    .select({ c: componentOptions.id })
    .from(componentOptions)
    .where(eq(componentOptions.slotId, slotId))
    .all().length;
  // First option in a slot is auto-activated so a slot always has exactly one
  // active option once it has any options at all.
  const isActive = existingCount === 0 ? true : data.isActive;
  const created = db
    .insert(componentOptions)
    .values({
      slotId,
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

// PUT /api/options/:id  (mounted at /api/options)
optionsRouter.put("/:id", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  requireOptionExists(id);
  const data = parseBody(req, componentOptionUpdateSchema);
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.brand !== undefined) updates.brand = data.brand ?? null;
  if (data.model !== undefined) updates.model = data.model ?? null;
  if (data.notes !== undefined) updates.notes = data.notes ?? null;
  // is_active is managed exclusively via the /activate endpoint; ignore here.
  if (Object.keys(updates).length === 0) {
    const row = db
      .select()
      .from(componentOptions)
      .where(eq(componentOptions.id, id))
      .get();
    res.json(row);
    return;
  }
  const updated = db
    .update(componentOptions)
    .set(updates)
    .where(eq(componentOptions.id, id))
    .returning()
    .get();
  res.json(updated);
});

// DELETE /api/options/:id
optionsRouter.delete("/:id", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  const existing = requireOptionExists(id);
  // Delete within a transaction so we can reassign the active flag atomically.
  db.transaction((tx) => {
    const result = tx
      .delete(componentOptions)
      .where(eq(componentOptions.id, id))
      .run();
    if (result.changes === 0) throw notFound("Component option");
    if (existing.isActive) {
      // Reassign active flag to the oldest remaining option (if any).
      const oldest = tx
        .select()
        .from(componentOptions)
        .where(eq(componentOptions.slotId, existing.slotId))
        .orderBy(asc(componentOptions.createdAt))
        .get();
      if (oldest) {
        tx.update(componentOptions)
          .set({ isActive: true })
          .where(eq(componentOptions.id, oldest.id))
          .run();
      }
    }
  });
  res.status(204).end();
});

// PATCH /api/options/:id/activate  — set this option active, others inactive.
optionsRouter.patch("/:id/activate", (req, res) => {
  const { id } = parseParams(req, ["id"]);
  const option = requireOptionExists(id);
  db.transaction((tx) => {
    // Deactivate all other options in the same slot.
    tx.update(componentOptions)
      .set({ isActive: false })
      .where(
        and(
          eq(componentOptions.slotId, option.slotId),
          ne(componentOptions.id, id),
        ),
      )
      .run();
    // Activate the chosen one.
    tx.update(componentOptions)
      .set({ isActive: true })
      .where(eq(componentOptions.id, id))
      .run();
  });
  const updated = db
    .select()
    .from(componentOptions)
    .where(eq(componentOptions.id, id))
    .get();
  res.json(updated);
});

export default optionsRouter;