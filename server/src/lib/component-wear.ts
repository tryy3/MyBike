import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { components, stravaActivities, stravaActivityComponents } from "../db/schema.js";
import { computeBaseline } from "./wear-baseline.js";

export interface WearTotals {
  distanceMeters: number;
  movingTimeMinutes: number;
}

export async function getStravaWearByComponentId(bikeId: string): Promise<Map<string, WearTotals>> {
  const rows = await db
    .select({
      componentId: stravaActivityComponents.componentId,
      distanceMeters: sql<number>`coalesce(sum(${stravaActivityComponents.distanceMeters}), 0)`.as(
        "distance_meters",
      ),
      movingTimeMinutes:
        sql<number>`coalesce(sum(${stravaActivityComponents.movingTimeMinutes}), 0)`.as(
          "moving_time_minutes",
        ),
    })
    .from(stravaActivityComponents)
    .innerJoin(stravaActivities, eq(stravaActivityComponents.activityId, stravaActivities.id))
    .where(eq(stravaActivities.bikeId, bikeId))
    .groupBy(stravaActivityComponents.componentId)
    .all();

  return new Map(
    rows.map((row) => [
      row.componentId,
      {
        distanceMeters: Number(row.distanceMeters),
        movingTimeMinutes: Number(row.movingTimeMinutes),
      },
    ]),
  );
}

export function displayWear(
  baselineDistance: number | null,
  baselineTime: number | null,
  stravaWear: WearTotals | undefined,
): WearTotals {
  return {
    distanceMeters: (baselineDistance ?? 0) + (stravaWear?.distanceMeters ?? 0),
    movingTimeMinutes: (baselineTime ?? 0) + (stravaWear?.movingTimeMinutes ?? 0),
  };
}

export async function migrateComponentBaselines(): Promise<{ updated: number }> {
  const allComponents = await db.select().from(components).all();
  let updated = 0;

  for (const component of allComponents) {
    const wear = await db
      .select({
        distanceMeters: sql<number>`coalesce(sum(${stravaActivityComponents.distanceMeters}), 0)`,
        movingTimeMinutes: sql<number>`coalesce(sum(${stravaActivityComponents.movingTimeMinutes}), 0)`,
      })
      .from(stravaActivityComponents)
      .where(eq(stravaActivityComponents.componentId, component.id))
      .get();

    const stravaDistance = Number(wear?.distanceMeters ?? 0);
    const stravaTime = Number(wear?.movingTimeMinutes ?? 0);
    const nextDistance = computeBaseline(component.distanceMeters, stravaDistance);
    const nextTime = computeBaseline(component.movingTimeMinutes, stravaTime);

    if (nextDistance !== component.distanceMeters || nextTime !== component.movingTimeMinutes) {
      await db
        .update(components)
        .set({ distanceMeters: nextDistance, movingTimeMinutes: nextTime })
        .where(eq(components.id, component.id))
        .run();
      updated += 1;
    }
  }

  return { updated };
}
