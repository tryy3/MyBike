import { z } from "zod";
import { CATEGORY_IDS } from "../categories.js";

const optionalNonEmptyString = z.string().trim().min(1).max(200);

export const componentFilterSchema = z.object({
  categories: z.array(z.enum(CATEGORY_IDS)).optional(),
  activeOnly: z.boolean().optional(),
  isActive: z.boolean().optional(),
  brands: z.array(optionalNonEmptyString).optional(),
  nameContains: optionalNonEmptyString.optional(),
  brandContains: optionalNonEmptyString.optional(),
  modelContains: optionalNonEmptyString.optional(),
});

export type ComponentFilter = z.infer<typeof componentFilterSchema>;
