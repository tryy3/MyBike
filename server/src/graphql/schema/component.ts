import { categoryLabel, isLubeType, LUBE_TYPE_IDS, normalizePropertiesForRead } from "shared";
import type { ComponentRow } from "../../db/schema.js";
import { builder } from "../builder.js";
import { getWearForComponent } from "../../services/stats.js";
import { getCachedStravaWearByBikeId } from "../wear-cache.js";
import { WearRef } from "./stats.js";

export const ComponentRef = builder.objectRef<ComponentRow>("Component");

export const LubeTypeEnum = builder.enumType("LubeType", {
  values: Object.fromEntries(LUBE_TYPE_IDS.map((id) => [id, { value: id }])),
});

type PropertiesParent = { lubeType?: string };

export const ComponentPropertiesRef = builder.objectRef<PropertiesParent>("ComponentProperties");

builder.objectType(ComponentPropertiesRef, {
  fields: (t) => ({
    lubeType: t.field({
      type: LubeTypeEnum,
      nullable: true,
      resolve: (parent) => (isLubeType(parent.lubeType) ? parent.lubeType : null),
    }),
  }),
});

export const ComponentPropertiesInput = builder.inputType("ComponentPropertiesInput", {
  fields: (t) => ({
    lubeType: t.field({ type: LubeTypeEnum, required: false }),
  }),
});

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
    properties: t.field({
      type: ComponentPropertiesRef,
      resolve: (parent) => normalizePropertiesForRead(parent.category, parent.properties),
    }),
    isActive: t.exposeBoolean("isActive"),
    isArchived: t.exposeBoolean("isArchived"),
    purchaseDate: t.exposeString("purchaseDate", { nullable: true }),
    purchaseCost: t.float({ nullable: true, resolve: (parent) => parent.purchaseCost }),
    purchaseStore: t.exposeString("purchaseStore", { nullable: true }),
    sortOrder: t.exposeInt("sortOrder"),
    createdAt: t.field({ type: "DateTime", resolve: (parent) => parent.createdAt }),
    updatedAt: t.field({ type: "DateTime", resolve: (parent) => parent.updatedAt }),
    wear: t.field({
      type: WearRef,
      resolve: async (parent, _args, context) => {
        const stravaWearByComponent = await getCachedStravaWearByBikeId(context, parent.bikeId);
        return getWearForComponent(
          parent.bikeId,
          parent.id,
          parent.distanceMeters,
          parent.movingTimeMinutes,
          stravaWearByComponent,
        );
      },
    }),
  }),
});
