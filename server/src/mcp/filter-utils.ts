import { CATEGORY_IDS, componentFilterSchema } from "shared";

export function normalizeCategoryId(value: string): string {
  return value.replace(/_/g, "-");
}

export function normalizeCategoryIds(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  return values.map(normalizeCategoryId);
}

export function parseComponentFilterInput(input: {
  categories?: string[];
  activeOnly?: boolean;
  isActive?: boolean;
  brands?: string[];
  nameContains?: string;
  brandContains?: string;
  modelContains?: string;
}) {
  const normalizedCategories = normalizeCategoryIds(input.categories);
  if (normalizedCategories) {
    for (const category of normalizedCategories) {
      if (!(CATEGORY_IDS as readonly string[]).includes(category)) {
        throw new Error(`Unknown component category: ${category}`);
      }
    }
  }

  return componentFilterSchema.parse({
    ...input,
    categories: normalizedCategories,
  });
}

export function mergeMcpComponentFilter(
  topLevelActiveOnly: boolean,
  filter?: ReturnType<typeof parseComponentFilterInput>,
) {
  if (!filter) {
    return topLevelActiveOnly ? { activeOnly: true } : undefined;
  }

  if (
    filter.activeOnly !== undefined &&
    topLevelActiveOnly &&
    filter.activeOnly !== topLevelActiveOnly
  ) {
    throw new Error("activeOnly conflicts between top-level argument and filter");
  }

  if (topLevelActiveOnly && filter.isActive === false) {
    throw new Error("activeOnly and isActive cannot both apply conflicting values");
  }

  const activeOnly = filter.activeOnly ?? topLevelActiveOnly;
  const { activeOnly: _ignored, isActive, ...rest } = filter;

  if (activeOnly) {
    return { ...rest, activeOnly: true };
  }

  if (isActive !== undefined) {
    return { ...rest, isActive };
  }

  return rest;
}
