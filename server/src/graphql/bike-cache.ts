import type { BikeRow } from "../db/schema.js";
import { requireBike } from "../services/bikes.js";
import type { GraphQLContext } from "./context.js";

/** Per-request cache: one ownership lookup per bike for all GraphQL resolvers. */
export function getCachedBike(
  context: GraphQLContext,
  bikeId: string,
  userId: string,
): Promise<BikeRow> {
  if (!context.bikeById) {
    context.bikeById = new Map();
  }
  let pending = context.bikeById.get(bikeId);
  if (!pending) {
    const load = () => requireBike(bikeId, userId);
    pending = context.timing?.enabled
      ? context.timing.time(`requireBike:${bikeId.slice(0, 8)}`, load)
      : load();
    context.bikeById.set(bikeId, pending);
  }
  return pending;
}
