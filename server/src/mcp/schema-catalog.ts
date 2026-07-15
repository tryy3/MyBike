import { CATEGORIES } from "shared";

export const BIKE_FIELDS = [
  "id",
  "name",
  "brand",
  "model",
  "year",
  "notes",
  "stravaGearId",
  "componentCount",
  "rideStats",
  "createdAt",
  "updatedAt",
] as const;

export const RIDE_STATS_FIELDS = ["distanceMeters", "movingTimeMinutes", "activityCount"] as const;

export const COMPONENT_FIELDS = [
  "id",
  "bikeId",
  "category",
  "categoryLabel",
  "name",
  "brand",
  "model",
  "notes",
  "isActive",
  "purchaseDate",
  "purchaseStore",
  "purchaseCost",
  "sortOrder",
  "wear",
  "createdAt",
  "updatedAt",
] as const;

export const WEAR_FIELDS = ["distanceMeters", "movingTimeMinutes"] as const;

export const CATEGORY_FIELDS = ["id", "label", "order"] as const;

export const COMPONENT_FILTER_FIELDS = [
  "categories",
  "activeOnly",
  "isActive",
  "brands",
  "nameContains",
  "brandContains",
  "modelContains",
] as const;

export const DEFAULT_BIKE_FIELDS = ["id", "name", "brand", "model", "componentCount"] as const;
export const DEFAULT_COMPONENT_FIELDS = [
  "category",
  "categoryLabel",
  "name",
  "brand",
  "model",
  "isActive",
] as const;
export const DEFAULT_CATEGORY_FIELDS = ["id", "label"] as const;

export function getSchemaCatalog() {
  return {
    bikeFields: [...BIKE_FIELDS],
    rideStatsFields: [...RIDE_STATS_FIELDS],
    componentFields: [...COMPONENT_FIELDS],
    wearFields: [...WEAR_FIELDS],
    categoryFields: [...CATEGORY_FIELDS],
    componentFilterFields: [...COMPONENT_FILTER_FIELDS],
    componentCategories: CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      order: category.order,
    })),
    notes: {
      typedTools:
        "Use fields[] on list_bikes, get_bike, list_component_categories, and get_bike_components to request only the data you need.",
      graphqlQuery:
        "Use graphql_query for ad-hoc read queries when typed tools are not enough. Mutations are rejected.",
      categoryIds:
        "Typed tools use hyphenated category ids (rear-derailleur). Raw GraphQL filter enums use underscores (rear_derailleur).",
      filters:
        "Component filters: categories, activeOnly, isActive, brands, nameContains, brandContains, modelContains.",
    },
  };
}

export function assertAllowedFields(
  requested: string[] | undefined,
  allowed: readonly string[],
  label: string,
): string[] {
  if (!requested || requested.length === 0) {
    return [...allowed];
  }
  const allowedSet = new Set<string>(allowed);
  const invalid = requested.filter((field) => !allowedSet.has(field));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid ${label} field(s): ${invalid.join(", ")}. Allowed: ${[...allowed].join(", ")}`,
    );
  }
  return requested;
}
