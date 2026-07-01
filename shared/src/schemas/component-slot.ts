import { z } from "zod";

export const componentSlotBaseSchema = z.object({
  name: z.string().min(1).max(200),
});

export const componentSlotInsertSchema = componentSlotBaseSchema;

export const componentSlotUpdateSchema = componentSlotBaseSchema.partial();

export const componentSlotSchema = componentSlotBaseSchema.extend({
  id: z.string().uuid(),
  bikeId: z.string().uuid(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type ComponentSlotBase = z.infer<typeof componentSlotBaseSchema>;
export type ComponentSlotInsert = z.infer<typeof componentSlotInsertSchema>;
export type ComponentSlotUpdate = z.infer<typeof componentSlotUpdateSchema>;
export type ComponentSlot = z.infer<typeof componentSlotSchema>;