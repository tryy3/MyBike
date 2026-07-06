import { describe, expect, it } from "vite-plus/test";
import { detectImportDrift } from "../lib/strava-import-drift.js";
import type { StravaImportDecision } from "shared";

describe("detectImportDrift", () => {
  const decisions: StravaImportDecision[] = [
    { gearId: "g1", action: "link", bikeId: "00000000-0000-4000-8000-000000000001" },
  ];

  it("returns no warnings when snapshot matches current aggregates", () => {
    const aggregates = new Map([
      [
        "g1",
        {
          gearId: "g1",
          stravaBikeName: "Road",
          activityCount: 2,
          distanceMeters: 10_000,
          movingTimeMinutes: 120,
        },
      ],
    ]);

    const warnings = detectImportDrift(
      [
        {
          gearId: "g1",
          activityCount: 2,
          distanceMeters: 10_000,
          movingTimeMinutes: 120,
        },
      ],
      aggregates,
      decisions,
    );

    expect(warnings).toEqual([]);
  });

  it("warns when ride totals changed since preview", () => {
    const aggregates = new Map([
      [
        "g1",
        {
          gearId: "g1",
          stravaBikeName: "Road",
          activityCount: 3,
          distanceMeters: 15_000,
          movingTimeMinutes: 180,
        },
      ],
    ]);

    const warnings = detectImportDrift(
      [
        {
          gearId: "g1",
          activityCount: 2,
          distanceMeters: 10_000,
          movingTimeMinutes: 120,
        },
      ],
      aggregates,
      decisions,
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Road");
    expect(warnings[0]).toContain("2→3");
  });

  it("returns no warnings when snapshot is omitted", () => {
    const aggregates = new Map([
      [
        "g1",
        {
          gearId: "g1",
          stravaBikeName: "Road",
          activityCount: 99,
          distanceMeters: 99,
          movingTimeMinutes: 99,
        },
      ],
    ]);

    expect(detectImportDrift(undefined, aggregates, decisions)).toEqual([]);
  });
});
