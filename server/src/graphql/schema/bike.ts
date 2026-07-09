import {
  bikeInsertSchema,
  bikeUpdateSchema,
  componentInsertSchema,
  componentReorderSchema,
  componentUpdateSchema,
} from "shared";
import type { BikeListItem } from "shared";
import type { BikeRow } from "../../db/schema.js";
import {
  createBike,
  deleteBike,
  listBikes,
  listComponentsForBike,
  requireBike,
  updateBike,
} from "../../services/bikes.js";
import {
  activateComponent,
  createComponent,
  deleteComponent,
  reorderComponents,
  updateComponent,
} from "../../services/components.js";
import { getRideStatsForBike } from "../../services/stats.js";
import { builder } from "../builder.js";
import { requireUserId } from "../context.js";
import { ComponentRef } from "./component.js";
import { RideStatsRef } from "./stats.js";

export const BikeRef = builder.objectRef<BikeRow | BikeListItem>("Bike");

builder.objectType(BikeRef, {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    brand: t.exposeString("brand", { nullable: true }),
    model: t.exposeString("model", { nullable: true }),
    year: t.int({ nullable: true, resolve: (parent) => parent.year }),
    notes: t.exposeString("notes", { nullable: true }),
    stravaGearId: t.exposeString("stravaGearId", { nullable: true }),
    createdAt: t.field({ type: "DateTime", resolve: (parent) => parent.createdAt }),
    updatedAt: t.field({ type: "DateTime", resolve: (parent) => parent.updatedAt }),
    componentCount: t.int({
      resolve: (parent, _args, context) => {
        if ("componentCount" in parent) return parent.componentCount;
        const userId = requireUserId(context);
        return listComponentsForBike(parent.id, userId).length;
      },
    }),
    rideStats: t.field({
      type: RideStatsRef,
      nullable: true,
      resolve: (parent, _args, context) => {
        const userId = requireUserId(context);
        return getRideStatsForBike(userId, parent.id);
      },
    }),
    components: t.field({
      type: [ComponentRef],
      args: {
        activeOnly: t.arg.boolean({ required: false, defaultValue: false }),
      },
      resolve: (parent, args, context) => {
        const userId = requireUserId(context);
        return listComponentsForBike(parent.id, userId, { activeOnly: args.activeOnly ?? false });
      },
    }),
  }),
});

const BikeInsertInput = builder.inputType("BikeInsertInput", {
  fields: (t) => ({
    name: t.string({ required: true }),
    brand: t.string({ required: false }),
    model: t.string({ required: false }),
    year: t.int({ required: false }),
    notes: t.string({ required: false }),
  }),
});

const BikeUpdateInput = builder.inputType("BikeUpdateInput", {
  fields: (t) => ({
    name: t.string({ required: false }),
    brand: t.string({ required: false }),
    model: t.string({ required: false }),
    year: t.int({ required: false }),
    notes: t.string({ required: false }),
  }),
});

const ComponentInsertInput = builder.inputType("ComponentInsertInput", {
  fields: (t) => ({
    category: t.string({ required: true }),
    name: t.string({ required: true }),
    brand: t.string({ required: true }),
    model: t.string({ required: true }),
    notes: t.string({ required: false }),
    isActive: t.boolean({ required: false, defaultValue: false }),
    distanceMeters: t.int({ required: false }),
    movingTimeMinutes: t.int({ required: false }),
    purchaseDate: t.string({ required: false }),
    purchaseCost: t.float({ required: false }),
    purchaseStore: t.string({ required: false }),
  }),
});

const ComponentUpdateInput = builder.inputType("ComponentUpdateInput", {
  fields: (t) => ({
    name: t.string({ required: false }),
    brand: t.string({ required: false }),
    model: t.string({ required: false }),
    notes: t.string({ required: false }),
    distanceMeters: t.int({ required: false }),
    movingTimeMinutes: t.int({ required: false }),
    purchaseDate: t.string({ required: false }),
    purchaseCost: t.float({ required: false }),
    purchaseStore: t.string({ required: false }),
  }),
});

builder.queryField("bikes", (t) =>
  t.field({
    type: [BikeRef],
    resolve: (_root, _args, context) => {
      const userId = requireUserId(context);
      return listBikes(userId);
    },
  }),
);

builder.queryField("bike", (t) =>
  t.field({
    type: BikeRef,
    nullable: false,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) => {
      const userId = requireUserId(context);
      return requireBike(args.id, userId);
    },
  }),
);

builder.mutationField("createBike", (t) =>
  t.field({
    type: BikeRef,
    args: {
      input: t.arg({ type: BikeInsertInput, required: true }),
    },
    resolve: (_root, args, context) => {
      const userId = requireUserId(context);
      const data = bikeInsertSchema.parse(args.input);
      return createBike(userId, data);
    },
  }),
);

builder.mutationField("updateBike", (t) =>
  t.field({
    type: BikeRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: BikeUpdateInput, required: true }),
    },
    resolve: (_root, args, context) => {
      const userId = requireUserId(context);
      const data = bikeUpdateSchema.parse(args.input);
      return updateBike(args.id, userId, data);
    },
  }),
);

builder.mutationField("deleteBike", (t) =>
  t.boolean({
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) => {
      const userId = requireUserId(context);
      deleteBike(args.id, userId);
      return true;
    },
  }),
);

builder.mutationField("createComponent", (t) =>
  t.field({
    type: ComponentRef,
    args: {
      bikeId: t.arg.id({ required: true }),
      input: t.arg({ type: ComponentInsertInput, required: true }),
    },
    resolve: (_root, args, context) => {
      const userId = requireUserId(context);
      const data = componentInsertSchema.parse(args.input);
      return createComponent(args.bikeId, userId, data);
    },
  }),
);

builder.mutationField("updateComponent", (t) =>
  t.field({
    type: ComponentRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: ComponentUpdateInput, required: true }),
    },
    resolve: (_root, args, context) => {
      const userId = requireUserId(context);
      const data = componentUpdateSchema.parse(args.input);
      return updateComponent(args.id, userId, data);
    },
  }),
);

builder.mutationField("deleteComponent", (t) =>
  t.boolean({
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) => {
      const userId = requireUserId(context);
      deleteComponent(args.id, userId);
      return true;
    },
  }),
);

builder.mutationField("activateComponent", (t) =>
  t.field({
    type: ComponentRef,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) => {
      const userId = requireUserId(context);
      return activateComponent(args.id, userId);
    },
  }),
);

builder.mutationField("reorderComponents", (t) =>
  t.boolean({
    args: {
      bikeId: t.arg.id({ required: true }),
      category: t.arg.string({ required: true }),
      orderedIds: t.arg.idList({ required: true }),
    },
    resolve: (_root, args, context) => {
      const userId = requireUserId(context);
      const data = componentReorderSchema.parse({
        category: args.category,
        orderedIds: args.orderedIds,
      });
      reorderComponents(args.bikeId, userId, data);
      return true;
    },
  }),
);
