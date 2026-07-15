import { bikeInsertSchema } from "./schemas/bike.js";
import {
  COMPONENT_CSV_COLUMNS,
  COMPONENT_IMPORT_MAX_BYTES,
  componentImportSchema,
  componentInsertSchema,
  componentUpdateSchema,
} from "./schemas/component.js";
import { stravaImportCommitSchema } from "./schemas/strava.js";
import { CATEGORY_IDS } from "./categories.js";
import { describe, expect, it } from "vite-plus/test";

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

const validComponent = {
  category: "frame" as const,
  name: "Frame",
  brand: "Brand",
  model: "Model",
};

describe("componentInsertSchema", () => {
  it("requires a known category", () => {
    const result = componentInsertSchema.safeParse({
      ...validComponent,
      category: "not-a-category",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every predefined category", () => {
    for (const category of CATEGORY_IDS) {
      const result = componentInsertSchema.safeParse({
        ...validComponent,
        category,
      });
      expect(result.success).toBe(true);
    }
  });

  it("requires brand and model", () => {
    expect(componentInsertSchema.safeParse({ category: "frame", name: "Frame" }).success).toBe(
      false,
    );
    expect(
      componentInsertSchema.safeParse({ category: "frame", name: "Frame", brand: "", model: "M" })
        .success,
    ).toBe(false);
  });

  it("accepts optional usage and purchase fields", () => {
    const result = componentInsertSchema.safeParse({
      ...validComponent,
      distanceMeters: 2400500,
      movingTimeMinutes: 90,
      purchaseDate: "2024-06-15",
      purchaseCost: 299.99,
      purchaseStore: "Local shop",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.distanceMeters).toBe(2400500);
      expect(result.data.purchaseStore).toBe("Local shop");
    }
  });
});

describe("componentUpdateSchema", () => {
  it("rejects empty brand when provided", () => {
    const result = componentUpdateSchema.safeParse({ brand: "  " });
    expect(result.success).toBe(false);
  });

  it("omits unset patch fields so partial updates do not clear them", () => {
    const result = componentUpdateSchema.safeParse({ purchaseCost: 42 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({ purchaseCost: 42 });
    expect("notes" in result.data).toBe(false);
    expect("purchaseDate" in result.data).toBe(false);
    expect("purchaseStore" in result.data).toBe(false);
    expect("distanceMeters" in result.data).toBe(false);
    expect("movingTimeMinutes" in result.data).toBe(false);
  });

  it("clears nullable fields when null or empty string is sent", () => {
    const result = componentUpdateSchema.safeParse({
      notes: "",
      purchaseDate: null,
      purchaseCost: null,
      purchaseStore: "   ",
      distanceMeters: null,
      movingTimeMinutes: null,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      notes: null,
      purchaseDate: null,
      purchaseCost: null,
      purchaseStore: null,
      distanceMeters: null,
      movingTimeMinutes: null,
    });
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
      "distanceMeters",
      "movingTimeMinutes",
      "purchaseDate",
      "purchaseCost",
      "purchaseStore",
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

describe("stravaImportCommitSchema", () => {
  it("requires a bike id when linking a Strava bike", () => {
    expect(
      stravaImportCommitSchema.safeParse({
        decisions: [{ gearId: "strava-bike-1", action: "link" }],
      }).success,
    ).toBe(false);
  });

  it("accepts create and skip import decisions", () => {
    const result = stravaImportCommitSchema.safeParse({
      decisions: [
        { gearId: "strava-bike-1", action: "create" },
        { gearId: "strava-bike-2", action: "skip" },
      ],
    });

    expect(result.success).toBe(true);
  });
});
