import { z } from "zod";

export const bikeBaseSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).nullish(),
  model: z.string().max(200).nullish(),
  year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1)
    .nullish(),
  notes: z.string().max(5000).nullish(),
});

export const bikeInsertSchema = bikeBaseSchema;

export const bikeUpdateSchema = bikeBaseSchema.partial();

export const bikeSchema = bikeBaseSchema.extend({
  id: z.string().uuid(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type BikeBase = z.infer<typeof bikeBaseSchema>;
export type BikeInsert = z.infer<typeof bikeInsertSchema>;
export type BikeUpdate = z.infer<typeof bikeUpdateSchema>;
export type Bike = z.infer<typeof bikeSchema>;
