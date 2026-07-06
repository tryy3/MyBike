import { z } from "zod";

export const stravaWebhookEventSchema = z.object({
  aspect_type: z.enum(["create", "update", "delete"]),
  event_time: z.number().int(),
  object_id: z.number().int(),
  object_type: z.enum(["activity", "athlete"]),
  owner_id: z.number().int(),
  subscription_id: z.number().int(),
  updates: z.record(z.string(), z.unknown()).optional(),
});

export const stravaWebhookEnvelopeSchema = z.object({
  id: z.number().int().positive(),
  receivedAt: z.string().datetime(),
  payload: stravaWebhookEventSchema,
});

export const stravaWebhookProxyEventsSchema = z.object({
  events: z.array(stravaWebhookEnvelopeSchema),
  nextAfterId: z.number().int().nullable(),
});

export const stravaWebhookProcessResultSchema = z.object({
  eventsProcessed: z.number().int().min(0),
  activitiesImported: z.number().int().min(0),
  skipped: z.number().int().min(0),
  errors: z.array(z.string()).optional(),
});

export type StravaWebhookEvent = z.infer<typeof stravaWebhookEventSchema>;
export type StravaWebhookEnvelope = z.infer<typeof stravaWebhookEnvelopeSchema>;
export type StravaWebhookProxyEvents = z.infer<typeof stravaWebhookProxyEventsSchema>;
export type StravaWebhookProcessResult = z.infer<typeof stravaWebhookProcessResultSchema>;
