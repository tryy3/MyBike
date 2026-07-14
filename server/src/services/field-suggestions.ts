import { eq } from "drizzle-orm";
import { fieldSuggestionsSchema, type FieldSuggestions } from "shared";
import { db } from "../db/index.js";
import { bikes, components } from "../db/schema.js";

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

export async function getFieldSuggestions(userId: string): Promise<FieldSuggestions> {
  const rows = await db
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

  return fieldSuggestionsSchema.parse({
    name: dedupeSorted(rows.map((r) => r.name)),
    brand: dedupeSorted(rows.map((r) => r.brand)),
    model: dedupeSorted(rows.map((r) => r.model)),
    purchaseStore: dedupeSorted(rows.map((r) => r.purchaseStore)),
  });
}
