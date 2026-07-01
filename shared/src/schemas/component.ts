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
  category: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type ComponentBase = z.infer<typeof componentBaseSchema>;
export type ComponentInsert = z.infer<typeof componentInsertSchema>;
export type ComponentUpdate = z.infer<typeof componentUpdateSchema>;
export type Component = z.infer<typeof componentSchema>;