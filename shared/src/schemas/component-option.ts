import { z } from "zod";

export const componentOptionBaseSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).nullish(),
  model: z.string().max(200).nullish(),
  notes: z.string().max(5000).nullish(),
  isActive: z.boolean().default(false),
});

export const componentOptionInsertSchema = componentOptionBaseSchema;

export const componentOptionUpdateSchema = componentOptionBaseSchema.partial();

export const componentOptionSchema = componentOptionBaseSchema.extend({
  id: z.string().uuid(),
  slotId: z.string().uuid(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type ComponentOptionBase = z.infer<typeof componentOptionBaseSchema>;
export type ComponentOptionInsert = z.infer<typeof componentOptionInsertSchema>;
export type ComponentOptionUpdate = z.infer<typeof componentOptionUpdateSchema>;
export type ComponentOption = z.infer<typeof componentOptionSchema>;