import { z } from "zod";

export const LUBE_TYPE_IDS = ["dry_lube", "wet_lube", "drip_wax", "immersion_wax"] as const;
export type LubeType = (typeof LUBE_TYPE_IDS)[number];
export const DEFAULT_LUBE_TYPE: LubeType = "wet_lube";

export const LUBE_TYPE_LABELS: Record<LubeType, string> = {
  dry_lube: "Dry lube",
  wet_lube: "Wet lube",
  drip_wax: "Drip wax",
  immersion_wax: "Immersion wax",
};

export const lubeTypeSchema = z.enum(LUBE_TYPE_IDS);

export const chainPropertiesSchema = z
  .object({
    lubeType: lubeTypeSchema,
  })
  .strict();

export const emptyPropertiesSchema = z.object({}).strict();

export type ComponentProperties =
  | z.infer<typeof chainPropertiesSchema>
  | z.infer<typeof emptyPropertiesSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate + default for writes (create/update/CSV/MCP). */
export function normalizePropertiesForWrite(category: string, input: unknown): ComponentProperties {
  if (category === "chain") {
    if (input === undefined || input === null) {
      return chainPropertiesSchema.parse({ lubeType: DEFAULT_LUBE_TYPE });
    }
    if (!isPlainObject(input)) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["properties"],
          message: "properties must be an object",
        },
      ]);
    }
    const withDefault =
      input.lubeType === undefined ? { ...input, lubeType: DEFAULT_LUBE_TYPE } : input;
    return chainPropertiesSchema.parse(withDefault);
  }

  if (input === undefined || input === null) return {};
  return emptyPropertiesSchema.parse(input);
}

/** Normalize DB values for API responses (never null). */
export function normalizePropertiesForRead(category: string, stored: unknown): ComponentProperties {
  if (stored === undefined || stored === null) {
    return category === "chain" ? { lubeType: DEFAULT_LUBE_TYPE } : {};
  }
  if (category === "chain") {
    if (isPlainObject(stored) && stored.lubeType === undefined) {
      return { lubeType: DEFAULT_LUBE_TYPE };
    }
    const parsed = chainPropertiesSchema.safeParse(stored);
    if (parsed.success) return parsed.data;
    // Legacy/removed enum values: still surface the stored string on read.
    if (isPlainObject(stored) && typeof stored.lubeType === "string") {
      return { lubeType: stored.lubeType as LubeType };
    }
    return { lubeType: DEFAULT_LUBE_TYPE };
  }
  return {};
}
