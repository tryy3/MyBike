import { z } from "zod";
import { CATEGORY_IDS } from "../categories";

export const componentBaseSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).nullish(),
  model: z.string().max(200).nullish(),
  notes: z.string().max(5000).nullish(),
  isActive: z.boolean().default(false),
});

export const componentInsertSchema = componentBaseSchema.extend({
  category: z.enum(CATEGORY_IDS),
});

export const componentUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  brand: z.string().max(200).nullish(),
  model: z.string().max(200).nullish(),
  notes: z.string().max(5000).nullish(),
});

export const componentSchema = componentBaseSchema.extend({
  id: z.string().uuid(),
  bikeId: z.string().uuid(),
  category: z.enum(CATEGORY_IDS),
  sortOrder: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

// Reorder the components within a single (bike, category). `orderedIds` must
// contain every component id of that (bike, category) exactly once; the server
// assigns sort_order = index of each id in this array.
export const componentReorderSchema = z.object({
  category: z.enum(CATEGORY_IDS),
  orderedIds: z.array(z.string().uuid()).min(1),
});

// Fixed column order for component CSV import/export. The `id` column drives
// the upsert: an empty cell inserts a new component; a non-empty cell updates
// the existing component with that id. Shared with the client so the two
// halves never drift on column names/order.
export const COMPONENT_CSV_COLUMNS = [
  "id",
  "category",
  "name",
  "brand",
  "model",
  "notes",
  "isActive",
] as const;

export type ComponentCsvColumn = (typeof COMPONENT_CSV_COLUMNS)[number];

export const componentImportSchema = z.object({
  csv: z.string().min(1),
  dryRun: z.boolean().optional(),
});

export type ComponentImportBody = z.infer<typeof componentImportSchema>;

export type ComponentBase = z.infer<typeof componentBaseSchema>;
export type ComponentInsert = z.infer<typeof componentInsertSchema>;
export type ComponentUpdate = z.infer<typeof componentUpdateSchema>;
export type Component = z.infer<typeof componentSchema>;
export type ComponentReorder = z.infer<typeof componentReorderSchema>;
