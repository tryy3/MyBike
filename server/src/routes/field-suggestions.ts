import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { bikes, components } from "../db/schema.js";
import { fieldSuggestionsSchema } from "shared";
import { requireAuth, getAuthContext } from "../lib/require-auth.js";

export const fieldSuggestionsRouter = Router();

fieldSuggestionsRouter.use(requireAuth);

function dedupeSorted(values: (string | null)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// GET /api/field-suggestions — distinct string values across the user's garage.
fieldSuggestionsRouter.get("/", (req, res) => {
  const { userId } = getAuthContext(req);
  const rows = db
    .select({
      name: components.name,
      brand: components.brand,
      model: components.model,
      purchaseStore: components.purchaseStore,
    })
    .from(components)
    .innerJoin(bikes, eq(components.bikeId, bikes.id))
    .where(eq(bikes.userId, userId))
    .all();

  const payload = fieldSuggestionsSchema.parse({
    name: dedupeSorted(rows.map((r) => r.name)),
    brand: dedupeSorted(rows.map((r) => r.brand)),
    model: dedupeSorted(rows.map((r) => r.model)),
    purchaseStore: dedupeSorted(rows.map((r) => r.purchaseStore)),
  });

  res.json(payload);
});

export default fieldSuggestionsRouter;
