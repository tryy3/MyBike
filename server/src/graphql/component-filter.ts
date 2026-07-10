import { CATEGORY_IDS, componentFilterSchema, type ComponentFilter } from "shared";
import { HttpError } from "../lib/errors.js";
import { builder } from "./builder.js";

function categoryIdToEnumName(id: string): string {
  return id.replace(/-/g, "_");
}

export const ComponentCategoryEnum = builder.enumType("ComponentCategory", {
  values: Object.fromEntries(CATEGORY_IDS.map((id) => [categoryIdToEnumName(id), { value: id }])),
});

export const ComponentFilterInput = builder.inputType("ComponentFilterInput", {
  fields: (t) => ({
    categories: t.field({ type: [ComponentCategoryEnum], required: false }),
    activeOnly: t.boolean({ required: false }),
    isActive: t.boolean({ required: false }),
    brands: t.stringList({ required: false }),
    nameContains: t.string({ required: false }),
    brandContains: t.string({ required: false }),
    modelContains: t.string({ required: false }),
  }),
});

export function mergeComponentFilter(
  topLevelActiveOnly: boolean,
  rawFilter?: {
    categories?: string[] | null;
    activeOnly?: boolean | null;
    isActive?: boolean | null;
    brands?: string[] | null;
    nameContains?: string | null;
    brandContains?: string | null;
    modelContains?: string | null;
  } | null,
): ComponentFilter {
  const filter = rawFilter ? componentFilterSchema.parse(rawFilter) : {};

  if (
    filter.activeOnly !== undefined &&
    topLevelActiveOnly &&
    filter.activeOnly !== topLevelActiveOnly
  ) {
    throw new HttpError(400, "activeOnly conflicts between top-level argument and filter");
  }

  const activeOnly = filter.activeOnly ?? topLevelActiveOnly;

  if (activeOnly && filter.isActive === false) {
    throw new HttpError(400, "activeOnly and isActive cannot both apply conflicting values");
  }

  const { activeOnly: _filterActiveOnly, isActive, ...rest } = filter;

  if (activeOnly) {
    return { ...rest, activeOnly: true };
  }

  if (isActive !== undefined) {
    return { ...rest, isActive };
  }

  return rest;
}
