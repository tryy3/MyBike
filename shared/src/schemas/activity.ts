import { z } from "zod";

export const activityListItemSchema = z.object({
  id: z.string().uuid(),
  startDate: z.string(),
  distanceMeters: z.number().int().min(0),
  movingTimeMinutes: z.number().int().min(0),
  componentIds: z.array(z.string().uuid()),
  componentNames: z.array(z.string()),
  editedAt: z.number().int().nullable(),
});

export const activityDetailSchema = activityListItemSchema.extend({
  bikeId: z.string().uuid(),
});

export const activityListSchema = z.object({
  items: z.array(activityListItemSchema),
  nextCursor: z.string().nullable(),
});

export const activityUpdateSchema = z.object({
  distanceMeters: z.number().int().min(0),
  movingTimeMinutes: z.number().int().min(0),
  componentIds: z.array(z.string().uuid()),
});

export type ActivityListItem = z.infer<typeof activityListItemSchema>;
export type ActivityDetail = z.infer<typeof activityDetailSchema>;
export type ActivityList = z.infer<typeof activityListSchema>;
export type ActivityUpdate = z.infer<typeof activityUpdateSchema>;
