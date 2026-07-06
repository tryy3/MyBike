import { z } from "zod";

export const rideStatsSchema = z.object({
  distanceMeters: z.number().int().min(0),
  movingTimeMinutes: z.number().int().min(0),
  activityCount: z.number().int().min(0),
});

export const componentWearSchema = z.object({
  id: z.string().uuid(),
  category: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  distanceMeters: z.number().int().min(0).nullable(),
  movingTimeMinutes: z.number().int().min(0).nullable(),
  isActive: z.boolean(),
});

export const garageBikeStatsSchema = z.object({
  bikeId: z.string().uuid(),
  rideStats: rideStatsSchema.nullable(),
});

export const garageStatsSchema = z.object({
  bikes: z.array(garageBikeStatsSchema),
});

export const bikeStatsSchema = z.object({
  bikeId: z.string().uuid(),
  rideStats: rideStatsSchema.nullable(),
  components: z.array(componentWearSchema),
});

export type RideStats = z.infer<typeof rideStatsSchema>;
export type ComponentWear = z.infer<typeof componentWearSchema>;
export type GarageStats = z.infer<typeof garageStatsSchema>;
export type BikeStats = z.infer<typeof bikeStatsSchema>;
