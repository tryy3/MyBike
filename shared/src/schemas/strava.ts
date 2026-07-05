import { z } from "zod";

export const stravaImportDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    gearId: z.string().min(1),
    action: z.literal("link"),
    bikeId: z.string().uuid(),
  }),
  z.object({
    gearId: z.string().min(1),
    action: z.literal("create"),
    bikeId: z.string().uuid().optional(),
  }),
  z.object({
    gearId: z.string().min(1),
    action: z.literal("skip"),
    bikeId: z.string().uuid().optional(),
  }),
]);

export const stravaImportCommitSchema = z.object({
  decisions: z.array(stravaImportDecisionSchema).min(1),
});

export const stravaImportItemSchema = z.object({
  gearId: z.string(),
  stravaBikeName: z.string(),
  distanceMeters: z.number().int().min(0),
  movingTimeMinutes: z.number().int().min(0),
  activityCount: z.number().int().min(0),
  matchedBikeId: z.string().uuid().nullable(),
  matchedBikeName: z.string().nullable(),
  matchReason: z.enum(["strava_link", "name"]).nullable(),
  recommendedAction: z.enum(["link", "create"]),
});

export const stravaImportPreviewSchema = z.object({
  items: z.array(stravaImportItemSchema),
});

export const stravaImportCommitResultSchema = z.object({
  linked: z.number().int().min(0),
  created: z.number().int().min(0),
  skipped: z.number().int().min(0),
  processedActivities: z.number().int().min(0),
  skippedActivities: z.number().int().min(0),
  creditedComponents: z.number().int().min(0),
});

export const stravaSyncResultSchema = z.object({
  processedActivities: z.number().int().min(0),
  skippedActivities: z.number().int().min(0),
  creditedComponents: z.number().int().min(0),
});

export const stravaStatusSchema = z.object({
  connected: z.boolean(),
  linkedBikes: z.number().int().min(0),
});

export type StravaImportDecision = z.infer<typeof stravaImportDecisionSchema>;
export type StravaImportCommit = z.infer<typeof stravaImportCommitSchema>;
export type StravaImportItem = z.infer<typeof stravaImportItemSchema>;
export type StravaImportPreview = z.infer<typeof stravaImportPreviewSchema>;
export type StravaImportCommitResult = z.infer<typeof stravaImportCommitResultSchema>;
export type StravaSyncResult = z.infer<typeof stravaSyncResultSchema>;
export type StravaStatus = z.infer<typeof stravaStatusSchema>;
