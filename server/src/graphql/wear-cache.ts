import { getStravaWearByComponentId, type WearTotals } from "../lib/component-wear.js";
import type { GraphQLContext } from "./context.js";

/** Per-request cache: one Strava wear aggregate per bike for all Component.wear fields. */
export function getCachedStravaWearByBikeId(
  context: GraphQLContext,
  bikeId: string,
): Promise<Map<string, WearTotals>> {
  if (!context.stravaWearByBikeId) {
    context.stravaWearByBikeId = new Map();
  }
  let pending = context.stravaWearByBikeId.get(bikeId);
  if (!pending) {
    const load = () => getStravaWearByComponentId(bikeId);
    pending = context.timing?.enabled
      ? context.timing.time(`stravaWear:${bikeId.slice(0, 8)}`, load)
      : load();
    context.stravaWearByBikeId.set(bikeId, pending);
  }
  return pending;
}
