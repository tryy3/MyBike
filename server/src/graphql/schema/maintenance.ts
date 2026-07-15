import {
  completeMaintenanceInputSchema,
  maintenanceTaskInsertSchema,
  maintenanceTaskUpdateSchema,
  replaceMaintenanceInputSchema,
  snoozeMaintenanceInputSchema,
  type MaintenanceTaskView,
  type ServiceRecordView,
} from "shared";
import { eq } from "drizzle-orm";
import { builder } from "../builder.js";
import { requireGraphQLPermission } from "../context.js";
import { BikeRef } from "./bike.js";
import { ComponentRef } from "./component.js";
import {
  completeMaintenanceTask,
  createMaintenanceTask,
  deleteMaintenanceTask,
  listServiceRecords,
  replaceComponentMaintenance,
  resetMaintenanceTaskToDefault,
  snoozeMaintenanceTask,
  toggleMaintenanceTask,
  toggleTouchUpCheckItem,
  clearTouchUpChecklist,
  updateMaintenanceTask,
} from "../../services/maintenance.js";
import { db } from "../../db/index.js";
import { components } from "../../db/schema.js";
import {
  countAlertsForCategoryFromTasks,
  countAlertsFromTasks,
  getCachedMaintenanceTasks,
} from "../maintenance-cache.js";

export const MaintenanceTaskRef = builder.objectRef<MaintenanceTaskView>("MaintenanceTask");

const MaintenanceTaskKindEnum = builder.enumType("MaintenanceTaskKind", {
  values: ["touch_up", "periodic", "eol"] as const,
});

const MaintenanceTaskSourceEnum = builder.enumType("MaintenanceTaskSource", {
  values: ["builtin", "custom"] as const,
});

const MaintenanceTaskStatusEnum = builder.enumType("MaintenanceTaskStatus", {
  values: ["ok", "due", "overdue", "snoozed"] as const,
});

const MaintenanceTriggerModeEnum = builder.enumType("MaintenanceTriggerMode", {
  values: ["distance", "time", "both"] as const,
});

const ServiceRecordActionEnum = builder.enumType("ServiceRecordAction", {
  values: ["serviced", "replaced"] as const,
});

export const MaintenanceTaskProgressRef =
  builder.objectRef<NonNullable<MaintenanceTaskView["progress"]>>("MaintenanceTaskProgress");

builder.objectType(MaintenanceTaskProgressRef, {
  fields: (t) => ({
    distanceUsedMeters: t.exposeInt("distanceUsedMeters", { nullable: true }),
    distanceLimitMeters: t.exposeInt("distanceLimitMeters", { nullable: true }),
    daysUsed: t.exposeInt("daysUsed", { nullable: true }),
    daysLimit: t.exposeInt("daysLimit", { nullable: true }),
    needsComponent: t.exposeBoolean("needsComponent"),
  }),
});

builder.objectType(MaintenanceTaskRef, {
  fields: (t) => ({
    id: t.exposeID("id"),
    bikeId: t.exposeID("bikeId"),
    source: t.field({ type: MaintenanceTaskSourceEnum, resolve: (p) => p.source }),
    templateKey: t.exposeString("templateKey", { nullable: true }),
    kind: t.field({ type: MaintenanceTaskKindEnum, resolve: (p) => p.kind }),
    title: t.exposeString("title"),
    description: t.exposeString("description", { nullable: true }),
    componentCategory: t.exposeString("componentCategory", { nullable: true }),
    triggerMode: t.field({
      type: MaintenanceTriggerModeEnum,
      nullable: true,
      resolve: (p) => p.triggerMode,
    }),
    distanceMeters: t.exposeInt("distanceMeters", { nullable: true }),
    intervalDays: t.exposeInt("intervalDays", { nullable: true }),
    guideUrl: t.exposeString("guideUrl", { nullable: true }),
    enabled: t.exposeBoolean("enabled"),
    customized: t.exposeBoolean("customized"),
    sortOrder: t.exposeInt("sortOrder"),
    status: t.field({ type: MaintenanceTaskStatusEnum, resolve: (p) => p.status }),
    progress: t.field({
      type: MaintenanceTaskProgressRef,
      nullable: true,
      resolve: (p) => p.progress,
    }),
    lastCheckedAt: t.field({
      type: "DateTime",
      nullable: true,
      resolve: (p) => p.lastCheckedAt,
    }),
    canDelete: t.exposeBoolean("canDelete"),
    createdAt: t.field({ type: "DateTime", resolve: (p) => p.createdAt }),
    updatedAt: t.field({ type: "DateTime", resolve: (p) => p.updatedAt }),
  }),
});

export const ServiceRecordRef = builder.objectRef<ServiceRecordView>("ServiceRecord");

builder.objectType(ServiceRecordRef, {
  fields: (t) => ({
    id: t.exposeID("id"),
    taskId: t.exposeID("taskId"),
    bikeId: t.exposeID("bikeId"),
    action: t.field({ type: ServiceRecordActionEnum, resolve: (p) => p.action }),
    completedAt: t.field({ type: "DateTime", resolve: (p) => p.completedAt }),
    notes: t.exposeString("notes", { nullable: true }),
    cost: t.float({ nullable: true, resolve: (p) => p.cost }),
    wearDistanceMeters: t.exposeInt("wearDistanceMeters", { nullable: true }),
    wearMovingTimeMinutes: t.exposeInt("wearMovingTimeMinutes", { nullable: true }),
    createdAt: t.field({ type: "DateTime", resolve: (p) => p.createdAt }),
    component: t.field({
      type: ComponentRef,
      nullable: true,
      resolve: async (parent) => {
        if (!parent.componentId) return null;
        return (
          (await db.select().from(components).where(eq(components.id, parent.componentId)).get()) ??
          null
        );
      },
    }),
  }),
});

const MaintenanceTaskInsertInput = builder.inputType("MaintenanceTaskInsertInput", {
  fields: (t) => ({
    kind: t.field({ type: MaintenanceTaskKindEnum, required: true }),
    title: t.string({ required: true }),
    description: t.string({ required: false }),
    componentCategory: t.string({ required: false }),
    triggerMode: t.field({ type: MaintenanceTriggerModeEnum, required: false }),
    distanceMeters: t.int({ required: false }),
    intervalDays: t.int({ required: false }),
    guideUrl: t.string({ required: false }),
    sortOrder: t.int({ required: false }),
  }),
});

const MaintenanceTaskUpdateInput = builder.inputType("MaintenanceTaskUpdateInput", {
  fields: (t) => ({
    title: t.string({ required: false }),
    description: t.string({ required: false }),
    componentCategory: t.string({ required: false }),
    triggerMode: t.field({ type: MaintenanceTriggerModeEnum, required: false }),
    distanceMeters: t.int({ required: false }),
    intervalDays: t.int({ required: false }),
    guideUrl: t.string({ required: false }),
    sortOrder: t.int({ required: false }),
  }),
});

const CompleteMaintenanceInput = builder.inputType("CompleteMaintenanceInput", {
  fields: (t) => ({
    notes: t.string({ required: false }),
    cost: t.float({ required: false }),
  }),
});

const ReplaceMaintenanceInput = builder.inputType("ReplaceMaintenanceInput", {
  fields: (t) => ({
    notes: t.string({ required: false }),
    cost: t.float({ required: false }),
    newComponentId: t.id({ required: false }),
    resetWear: t.boolean({ required: false }),
  }),
});

const SnoozeMaintenanceInput = builder.inputType("SnoozeMaintenanceInput", {
  fields: (t) => ({
    distanceMeters: t.int({ required: false }),
    days: t.int({ required: false }),
  }),
});

builder.mutationField("createMaintenanceTask", (t) =>
  t.field({
    type: MaintenanceTaskRef,
    args: {
      bikeId: t.arg.id({ required: true }),
      input: t.arg({ type: MaintenanceTaskInsertInput, required: true }),
    },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "write");
      const data = maintenanceTaskInsertSchema.parse(args.input);
      return createMaintenanceTask(args.bikeId, userId, data);
    },
  }),
);

builder.mutationField("updateMaintenanceTask", (t) =>
  t.field({
    type: MaintenanceTaskRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: MaintenanceTaskUpdateInput, required: true }),
    },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "write");
      const data = maintenanceTaskUpdateSchema.parse(args.input);
      return updateMaintenanceTask(args.id, userId, data);
    },
  }),
);

builder.mutationField("toggleMaintenanceTask", (t) =>
  t.field({
    type: MaintenanceTaskRef,
    args: {
      id: t.arg.id({ required: true }),
      enabled: t.arg.boolean({ required: true }),
    },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "write");
      return toggleMaintenanceTask(args.id, userId, args.enabled);
    },
  }),
);

builder.mutationField("deleteMaintenanceTask", (t) =>
  t.boolean({
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "delete");
      await deleteMaintenanceTask(args.id, userId);
      return true;
    },
  }),
);

builder.mutationField("resetMaintenanceTaskToDefault", (t) =>
  t.field({
    type: MaintenanceTaskRef,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "write");
      return resetMaintenanceTaskToDefault(args.id, userId);
    },
  }),
);

builder.mutationField("completeMaintenanceTask", (t) =>
  t.field({
    type: ServiceRecordRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: CompleteMaintenanceInput, required: false }),
    },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "write");
      const data = completeMaintenanceInputSchema.parse(args.input ?? {});
      return completeMaintenanceTask(args.id, userId, data);
    },
  }),
);

builder.mutationField("replaceComponentMaintenance", (t) =>
  t.field({
    type: ServiceRecordRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: ReplaceMaintenanceInput, required: true }),
    },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "write");
      const data = replaceMaintenanceInputSchema.parse(args.input);
      return replaceComponentMaintenance(args.id, userId, data);
    },
  }),
);

builder.mutationField("snoozeMaintenanceTask", (t) =>
  t.field({
    type: MaintenanceTaskRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: SnoozeMaintenanceInput, required: true }),
    },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "write");
      const data = snoozeMaintenanceInputSchema.parse(args.input);
      return snoozeMaintenanceTask(args.id, userId, data);
    },
  }),
);

builder.mutationField("toggleTouchUpCheckItem", (t) =>
  t.field({
    type: MaintenanceTaskRef,
    args: { taskId: t.arg.id({ required: true }) },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "write");
      return toggleTouchUpCheckItem(args.taskId, userId);
    },
  }),
);

builder.mutationField("clearTouchUpChecklist", (t) =>
  t.field({
    type: [MaintenanceTaskRef],
    args: { bikeId: t.arg.id({ required: true }) },
    resolve: async (_root, args, context) => {
      const userId = requireGraphQLPermission(context, "write");
      return clearTouchUpChecklist(args.bikeId, userId);
    },
  }),
);

builder.objectFields(BikeRef, (t) => ({
  maintenanceTasks: t.field({
    type: [MaintenanceTaskRef],
    resolve: async (parent, _args, context) => {
      const userId = requireGraphQLPermission(context, "read");
      return getCachedMaintenanceTasks(context, parent.id, userId);
    },
  }),
  maintenanceAlertCount: t.int({
    resolve: async (parent, _args, context) => {
      const userId = requireGraphQLPermission(context, "read");
      const tasks = await getCachedMaintenanceTasks(context, parent.id, userId);
      return countAlertsFromTasks(tasks);
    },
  }),
  serviceRecords: t.field({
    type: [ServiceRecordRef],
    args: { limit: t.arg.int({ required: false, defaultValue: 50 }) },
    resolve: async (parent, args, context) => {
      const userId = requireGraphQLPermission(context, "read");
      return listServiceRecords(parent.id, userId, args.limit ?? 50);
    },
  }),
}));

builder.objectFields(ComponentRef, (t) => ({
  maintenanceTasks: t.field({
    type: [MaintenanceTaskRef],
    resolve: async (parent, _args, context) => {
      const userId = requireGraphQLPermission(context, "read");
      const tasks = await getCachedMaintenanceTasks(context, parent.bikeId, userId);
      return tasks.filter(
        (task) => task.componentCategory === parent.category && task.kind !== "touch_up",
      );
    },
  }),
  maintenanceAlertCount: t.int({
    resolve: async (parent, _args, context) => {
      const userId = requireGraphQLPermission(context, "read");
      const tasks = await getCachedMaintenanceTasks(context, parent.bikeId, userId);
      return countAlertsForCategoryFromTasks(tasks, parent.category);
    },
  }),
}));
