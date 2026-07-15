import { z } from "zod";
import { CATEGORY_IDS } from "../categories.js";

const requiredString = z.string().trim().min(1).max(200);
const optionalString = z
  .string()
  .max(200)
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const optionalNotes = z
  .string()
  .max(5000)
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v));

const optionalInt = z
  .number()
  .int()
  .min(0)
  .nullish()
  .transform((v) => (v == null ? null : v));

const optionalCost = z
  .number()
  .min(0)
  .nullish()
  .transform((v) => (v == null ? null : v));

const purchaseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v));

/** Patch field: omitted → leave unchanged; null/"" → clear; value → set. */
const patchNotes = z
  .union([z.string().max(5000), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v == null || v.trim() === "" ? null : v));

const patchOptionalString = z
  .union([z.string().max(200), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v == null || v.trim() === "" ? null : v.trim()));

const patchOptionalInt = z.union([z.number().int().min(0), z.null()]).optional();

const patchOptionalCost = z.union([z.number().min(0), z.null()]).optional();

const patchPurchaseDate = z
  .union([
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .or(z.literal("")),
    z.null(),
  ])
  .optional()
  .transform((v) => (v === undefined ? undefined : v == null || v.trim() === "" ? null : v));

const componentOptionalFields = {
  distanceMeters: optionalInt,
  movingTimeMinutes: optionalInt,
  purchaseDate: purchaseDateSchema,
  purchaseCost: optionalCost,
  purchaseStore: optionalString,
};

export const componentBaseSchema = z.object({
  name: requiredString,
  brand: z.string().max(200).nullable(),
  model: z.string().max(200).nullable(),
  notes: optionalNotes,
  isActive: z.boolean().default(false),
  ...componentOptionalFields,
});

export const componentInsertSchema = componentBaseSchema.extend({
  category: z.enum(CATEGORY_IDS),
  brand: requiredString,
  model: requiredString,
});

export const componentUpdateSchema = z.object({
  name: requiredString.optional(),
  brand: requiredString.optional(),
  model: requiredString.optional(),
  notes: patchNotes,
  distanceMeters: patchOptionalInt,
  movingTimeMinutes: patchOptionalInt,
  purchaseDate: patchPurchaseDate,
  purchaseCost: patchOptionalCost,
  purchaseStore: patchOptionalString,
});

export const componentSchema = componentBaseSchema.extend({
  id: z.string().uuid(),
  bikeId: z.string().uuid(),
  category: z.enum(CATEGORY_IDS),
  sortOrder: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const fieldSuggestionsSchema = z.object({
  name: z.array(z.string()),
  brand: z.array(z.string()),
  model: z.array(z.string()),
  purchaseStore: z.array(z.string()),
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
  "distanceMeters",
  "movingTimeMinutes",
  "purchaseDate",
  "purchaseCost",
  "purchaseStore",
] as const;

/** Header row accepted by import before the new optional columns were added. */
export const COMPONENT_CSV_LEGACY_COLUMNS = COMPONENT_CSV_COLUMNS.slice(0, 7);

export type ComponentCsvColumn = (typeof COMPONENT_CSV_COLUMNS)[number];

export const COMPONENT_IMPORT_MAX_BYTES = 256 * 1024;

export const componentImportSchema = z.object({
  csv: z.string().min(1).max(COMPONENT_IMPORT_MAX_BYTES),
  dryRun: z.boolean().optional(),
});

export type ComponentImportBody = z.infer<typeof componentImportSchema>;
export type FieldSuggestions = z.infer<typeof fieldSuggestionsSchema>;

export type ComponentBase = z.infer<typeof componentBaseSchema>;
export type ComponentInsert = z.infer<typeof componentInsertSchema>;
export type ComponentUpdate = z.infer<typeof componentUpdateSchema>;
export type Component = z.infer<typeof componentSchema>;
export type ComponentReorder = z.infer<typeof componentReorderSchema>;
