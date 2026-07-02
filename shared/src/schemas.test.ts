import { bikeInsertSchema } from "./schemas/bike.js";
import {
  COMPONENT_CSV_COLUMNS,
  COMPONENT_IMPORT_MAX_BYTES,
  componentImportSchema,
  componentInsertSchema,
} from "./schemas/component.js";
import { CATEGORY_IDS } from "./categories.js";
import { describe, expect, it } from "vitest";

describe("bikeInsertSchema", () => {
  it("accepts a valid year", () => {
    const result = bikeInsertSchema.safeParse({
      name: "Road",
      year: new Date().getFullYear(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a year too far in the future", () => {
    const result = bikeInsertSchema.safeParse({
      name: "Future",
      year: new Date().getFullYear() + 5,
    });
    expect(result.success).toBe(false);
  });
});

describe("componentInsertSchema", () => {
  it("requires a known category", () => {
    const result = componentInsertSchema.safeParse({
      category: "not-a-category",
      name: "Part",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every predefined category", () => {
    for (const category of CATEGORY_IDS) {
      const result = componentInsertSchema.safeParse({
        category,
        name: "Part",
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("COMPONENT_CSV_COLUMNS", () => {
  it("matches the documented import/export column order", () => {
    expect(COMPONENT_CSV_COLUMNS).toEqual([
      "id",
      "category",
      "name",
      "brand",
      "model",
      "notes",
      "isActive",
    ]);
  });
});

describe("componentImportSchema", () => {
  it("rejects CSV payloads over the shared import byte limit", () => {
    const result = componentImportSchema.safeParse({
      csv: "a".repeat(COMPONENT_IMPORT_MAX_BYTES + 1),
      dryRun: true,
    });

    expect(result.success).toBe(false);
  });
});
