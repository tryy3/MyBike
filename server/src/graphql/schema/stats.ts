import type { GarageStats, RideStats } from "shared";
import type { WearTotals } from "../../lib/component-wear.js";
import { builder } from "../builder.js";
import { getGarageStats } from "../../services/stats.js";
import { requireGraphQLPermission } from "../context.js";

const RideStatsRef = builder.objectRef<RideStats>("RideStats");
builder.objectType(RideStatsRef, {
  fields: (t) => ({
    distanceMeters: t.exposeInt("distanceMeters"),
    movingTimeMinutes: t.exposeInt("movingTimeMinutes"),
    activityCount: t.exposeInt("activityCount"),
  }),
});

const WearRef = builder.objectRef<{
  distanceMeters: number | null;
  movingTimeMinutes: number | null;
}>("Wear");
builder.objectType(WearRef, {
  fields: (t) => ({
    distanceMeters: t.int({ nullable: true, resolve: (parent) => parent.distanceMeters }),
    movingTimeMinutes: t.int({ nullable: true, resolve: (parent) => parent.movingTimeMinutes }),
  }),
});

export { RideStatsRef, WearRef };

const GarageBikeStatsRef = builder.objectRef<GarageStats["bikes"][number]>("GarageBikeStats");
builder.objectType(GarageBikeStatsRef, {
  fields: (t) => ({
    bikeId: t.exposeID("bikeId"),
    rideStats: t.field({
      type: RideStatsRef,
      nullable: true,
      resolve: (parent) => parent.rideStats,
    }),
  }),
});

const GarageStatsRef = builder.objectRef<GarageStats>("GarageStats");
builder.objectType(GarageStatsRef, {
  fields: (t) => ({
    bikes: t.field({
      type: [GarageBikeStatsRef],
      resolve: (parent) => parent.bikes,
    }),
  }),
});

builder.queryField("garageStats", (t) =>
  t.field({
    type: GarageStatsRef,
    resolve: (_root, _args, context) => {
      const userId = requireGraphQLPermission(context, "read");
      return getGarageStats(userId);
    },
  }),
);

export type WearDisplay = WearTotals & {
  distanceMeters: number | null;
  movingTimeMinutes: number | null;
};
