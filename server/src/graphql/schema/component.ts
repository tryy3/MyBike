import { categoryLabel } from "shared";
import type { ComponentRow } from "../../db/schema.js";
import { builder } from "../builder.js";
import { getWearForComponent } from "../../services/stats.js";
import { WearRef } from "./stats.js";

export const ComponentRef = builder.objectRef<ComponentRow>("Component");

builder.objectType(ComponentRef, {
  fields: (t) => ({
    id: t.exposeID("id"),
    bikeId: t.exposeID("bikeId"),
    category: t.exposeString("category"),
    categoryLabel: t.string({ resolve: (parent) => categoryLabel(parent.category) }),
    name: t.exposeString("name"),
    brand: t.exposeString("brand", { nullable: true }),
    model: t.exposeString("model", { nullable: true }),
    notes: t.exposeString("notes", { nullable: true }),
    isActive: t.exposeBoolean("isActive"),
    purchaseDate: t.exposeString("purchaseDate", { nullable: true }),
    purchaseCost: t.float({ nullable: true, resolve: (parent) => parent.purchaseCost }),
    purchaseStore: t.exposeString("purchaseStore", { nullable: true }),
    sortOrder: t.exposeInt("sortOrder"),
    createdAt: t.field({ type: "DateTime", resolve: (parent) => parent.createdAt }),
    updatedAt: t.field({ type: "DateTime", resolve: (parent) => parent.updatedAt }),
    wear: t.field({
      type: WearRef,
      resolve: (parent) =>
        getWearForComponent(
          parent.bikeId,
          parent.id,
          parent.distanceMeters,
          parent.movingTimeMinutes,
        ),
    }),
  }),
});
