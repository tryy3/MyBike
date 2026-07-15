import { z } from "zod";
import { CATEGORY_IDS } from "../categories.js";

const optionalString = z
  .string()
  .max(2000)
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const optionalUrl = z
  .string()
  .url()
  .max(2000)
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const optionalNotes = z
  .string()
  .max(5000)
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v));

const positiveInt = z.number().int().min(1);
const nonNegativeInt = z.number().int().min(0);

export const maintenanceTaskKindSchema = z.enum(["touch_up", "periodic", "eol"]);
export type MaintenanceTaskKind = z.infer<typeof maintenanceTaskKindSchema>;

export const maintenanceTaskSourceSchema = z.enum(["builtin", "custom"]);
export type MaintenanceTaskSource = z.infer<typeof maintenanceTaskSourceSchema>;

export const maintenanceTaskStatusSchema = z.enum(["ok", "due", "overdue", "snoozed"]);
export type MaintenanceTaskStatus = z.infer<typeof maintenanceTaskStatusSchema>;

export const maintenanceTriggerModeSchema = z.enum(["distance", "time", "both"]);
export type MaintenanceTriggerMode = z.infer<typeof maintenanceTriggerModeSchema>;

export const serviceRecordActionSchema = z.enum(["serviced", "replaced"]);
export type ServiceRecordAction = z.infer<typeof serviceRecordActionSchema>;

export const maintenanceTemplateSchema = z.object({
  templateKey: z.string().min(1).max(100),
  kind: maintenanceTaskKindSchema,
  title: z.string().min(1).max(200),
  description: optionalString,
  componentCategory: z.enum(CATEGORY_IDS).nullable(),
  triggerMode: maintenanceTriggerModeSchema.nullable(),
  distanceMeters: nonNegativeInt.nullable(),
  intervalDays: positiveInt.nullable(),
  guideUrl: optionalUrl,
  sortOrder: z.number().int().min(0),
});

export type MaintenanceTemplate = z.infer<typeof maintenanceTemplateSchema>;

const taskTriggerFields = {
  triggerMode: maintenanceTriggerModeSchema.nullish(),
  distanceMeters: nonNegativeInt.nullish(),
  intervalDays: positiveInt.nullish(),
  guideUrl: optionalUrl,
};

export const maintenanceTaskInsertSchema = z
  .object({
    kind: maintenanceTaskKindSchema,
    title: z.string().trim().min(1).max(200),
    description: optionalString,
    componentCategory: z.enum(CATEGORY_IDS).nullish(),
    ...taskTriggerFields,
    sortOrder: z.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "touch_up") {
      if (data.componentCategory) {
        ctx.addIssue({
          code: "custom",
          message: "Touch-up tasks cannot be linked to a component category",
          path: ["componentCategory"],
        });
      }
      return;
    }
    if (!data.componentCategory) {
      ctx.addIssue({
        code: "custom",
        message: "Component category is required for periodic and EOL tasks",
        path: ["componentCategory"],
      });
    }
    const mode = data.triggerMode ?? (data.kind === "eol" ? "distance" : undefined);
    if (data.kind === "eol") {
      if (mode !== "distance" && mode != null) {
        ctx.addIssue({
          code: "custom",
          message: "EOL tasks use distance limits only",
          path: ["triggerMode"],
        });
      }
      if (data.distanceMeters == null) {
        ctx.addIssue({
          code: "custom",
          message: "Distance limit is required for EOL tasks",
          path: ["distanceMeters"],
        });
      }
      return;
    }
    if (!mode) {
      ctx.addIssue({
        code: "custom",
        message: "Trigger mode is required for periodic tasks",
        path: ["triggerMode"],
      });
      return;
    }
    if ((mode === "distance" || mode === "both") && data.distanceMeters == null) {
      ctx.addIssue({
        code: "custom",
        message: "Distance interval is required for this trigger mode",
        path: ["distanceMeters"],
      });
    }
    if ((mode === "time" || mode === "both") && data.intervalDays == null) {
      ctx.addIssue({
        code: "custom",
        message: "Time interval is required for this trigger mode",
        path: ["intervalDays"],
      });
    }
  });

export type MaintenanceTaskInsert = z.infer<typeof maintenanceTaskInsertSchema>;

export const maintenanceTaskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: optionalString.optional(),
  componentCategory: z.enum(CATEGORY_IDS).nullish(),
  ...taskTriggerFields,
  sortOrder: z.number().int().min(0).optional(),
});

export type MaintenanceTaskUpdate = z.infer<typeof maintenanceTaskUpdateSchema>;

export const completeMaintenanceInputSchema = z.object({
  notes: optionalNotes,
  cost: z.number().min(0).nullish(),
});

export type CompleteMaintenanceInput = z.infer<typeof completeMaintenanceInputSchema>;

export const replaceMaintenanceInputSchema = z.object({
  notes: optionalNotes,
  cost: z.number().min(0).nullish(),
  newComponentId: z.string().uuid().optional(),
  resetWear: z.boolean().optional(),
});

export type ReplaceMaintenanceInput = z.infer<typeof replaceMaintenanceInputSchema>;

export const snoozeMaintenanceInputSchema = z
  .object({
    distanceMeters: positiveInt.optional(),
    days: positiveInt.optional(),
  })
  .superRefine((data, ctx) => {
    const hasDistance = data.distanceMeters != null;
    const hasTime = data.days != null;
    if (hasDistance === hasTime) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of distanceMeters or days",
      });
    }
  });

export type SnoozeMaintenanceInput = z.infer<typeof snoozeMaintenanceInputSchema>;

export interface MaintenanceTaskProgress {
  distanceUsedMeters: number | null;
  distanceLimitMeters: number | null;
  daysUsed: number | null;
  daysLimit: number | null;
  needsComponent: boolean;
}

export interface MaintenanceTaskView {
  id: string;
  bikeId: string;
  source: MaintenanceTaskSource;
  templateKey: string | null;
  kind: MaintenanceTaskKind;
  title: string;
  description: string | null;
  componentCategory: string | null;
  triggerMode: MaintenanceTriggerMode | null;
  distanceMeters: number | null;
  intervalDays: number | null;
  guideUrl: string | null;
  enabled: boolean;
  customized: boolean;
  sortOrder: number;
  status: MaintenanceTaskStatus;
  progress: MaintenanceTaskProgress | null;
  lastCheckedAt: number | null;
  canDelete: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ServiceRecordView {
  id: string;
  taskId: string;
  bikeId: string;
  componentId: string | null;
  action: ServiceRecordAction;
  completedAt: number;
  notes: string | null;
  cost: number | null;
  wearDistanceMeters: number | null;
  wearMovingTimeMinutes: number | null;
  createdAt: number;
}
