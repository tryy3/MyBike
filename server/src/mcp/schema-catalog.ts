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

export const MAINTENANCE_TASK_FIELDS = [
  "id",
  "bikeId",
  "source",
  "templateKey",
  "kind",
  "title",
  "description",
  "componentCategory",
  "triggerMode",
  "distanceMeters",
  "intervalDays",
  "guideUrl",
  "enabled",
  "customized",
  "sortOrder",
  "status",
  "progress",
  "lastCheckedAt",
  "canDelete",
  "createdAt",
  "updatedAt",
] as const;

export const DEFAULT_BIKE_FIELDS = ["id", "name", "brand", "model", "componentCount"] as const;
export const DEFAULT_COMPONENT_FIELDS = [
  "id",
  "category",
  "categoryLabel",
  "name",
  "brand",
  "model",
  "isActive",
] as const;
export const DEFAULT_CATEGORY_FIELDS = ["id", "label"] as const;
export const DEFAULT_MAINTENANCE_TASK_FIELDS = [
  "id",
  "kind",
  "title",
  "componentCategory",
  "status",
  "progress",
  "enabled",
  "templateKey",
] as const;

export function getSchemaCatalog() {
  return {
    bikeFields: [...BIKE_FIELDS],
    rideStatsFields: [...RIDE_STATS_FIELDS],
    componentFields: [...COMPONENT_FIELDS],
    wearFields: [...WEAR_FIELDS],
    categoryFields: [...CATEGORY_FIELDS],
    componentFilterFields: [...COMPONENT_FILTER_FIELDS],
    maintenanceTaskFields: [...MAINTENANCE_TASK_FIELDS],
    defaultMaintenanceTaskFields: [...DEFAULT_MAINTENANCE_TASK_FIELDS],
    componentCategories: CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      order: category.order,
    })),
    notes: {
      typedTools:
        "Use fields[] on list/get tools to request only needed data. Write tools: create_component (inactive when sibling exists), update_component (brand/model/purchase/notes only — not name), set_active_component (rotate spares), replace_component (EOL service record + activate).",
      workflows:
        "EOL replace: find_bike → create_component → replace_component(bikeId+category+newComponentId). Spare rotation: find_bike → get_bike_components → set_active_component.",
      graphqlQuery:
        "Use graphql_query for ad-hoc read queries when typed tools are not enough. Mutations are rejected.",
      categoryIds:
        "Typed tools use hyphenated category ids (rear-derailleur). Raw GraphQL filter enums use underscores (rear_derailleur).",
      filters:
        "Component filters: categories, activeOnly, isActive, brands, nameContains, brandContains, modelContains.",
      auth: "Read tools need graphql:read. Write tools need graphql:write on the API key.",
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
