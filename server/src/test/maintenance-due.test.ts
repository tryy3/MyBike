import { describe, expect, it } from "vite-plus/test";
import type { MaintenanceTaskRow } from "../db/schema.js";
import { computeTaskDueStatus, daysBetween } from "../lib/maintenance-due.js";

function task(overrides: Partial<MaintenanceTaskRow> = {}): MaintenanceTaskRow {
  return {
    id: "task-1",
    bikeId: "bike-1",
    source: "builtin",
    templateKey: "chain-eol",
    kind: "eol",
    title: "Replace chain",
    description: null,
    componentCategory: "chain",
    triggerMode: "distance",
    distanceMeters: 3_000_000,
    intervalDays: null,
    guideUrl: null,
    enabled: true,
    customized: false,
    sortOrder: 0,
    snoozedUntilDistanceMeters: null,
    snoozedUntilAt: null,
    createdAt: Date.UTC(2026, 0, 1),
    updatedAt: Date.UTC(2026, 0, 1),
    ...overrides,
  };
}

describe("maintenance-due", () => {
  it("computes EOL due when wear exceeds limit", () => {
    const result = computeTaskDueStatus(
      task(),
      {
        wear: { distanceMeters: 3_100_000, movingTimeMinutes: 0 },
        lastServiceAt: null,
        lastServiceWear: null,
        taskCreatedAt: Date.UTC(2026, 0, 1),
      },
      Date.UTC(2026, 5, 1),
    );
    expect(result.status).toBe("due");
    expect(result.progress?.distanceUsedMeters).toBe(3_100_000);
  });

  it("computes EOL overdue when wear exceeds 125% of limit", () => {
    const result = computeTaskDueStatus(
      task(),
      {
        wear: { distanceMeters: 3_800_000, movingTimeMinutes: 0 },
        lastServiceAt: null,
        lastServiceWear: null,
        taskCreatedAt: Date.UTC(2026, 0, 1),
      },
      Date.UTC(2026, 5, 1),
    );
    expect(result.status).toBe("overdue");
  });

  it("computes periodic distance due since last service", () => {
    const result = computeTaskDueStatus(
      task({
        kind: "periodic",
        templateKey: "rewax-chain",
        distanceMeters: 500_000,
        triggerMode: "distance",
      }),
      {
        wear: { distanceMeters: 1_600_000, movingTimeMinutes: 0 },
        lastServiceAt: Date.UTC(2026, 0, 1),
        lastServiceWear: { distanceMeters: 1_000_000, movingTimeMinutes: 0 },
        taskCreatedAt: Date.UTC(2026, 0, 1),
      },
      Date.UTC(2026, 5, 1),
    );
    expect(result.status).toBe("due");
    expect(result.progress?.distanceUsedMeters).toBe(600_000);
  });

  it("respects snooze until distance", () => {
    const result = computeTaskDueStatus(
      task({ snoozedUntilDistanceMeters: 3_200_000 }),
      {
        wear: { distanceMeters: 3_100_000, movingTimeMinutes: 0 },
        lastServiceAt: null,
        lastServiceWear: null,
        taskCreatedAt: Date.UTC(2026, 0, 1),
      },
      Date.UTC(2026, 5, 1),
    );
    expect(result.status).toBe("snoozed");
  });

  it("ignores distance snooze on time-only periodic tasks", () => {
    const result = computeTaskDueStatus(
      task({
        kind: "periodic",
        templateKey: "chain-lube",
        triggerMode: "time",
        distanceMeters: null,
        intervalDays: 30,
        snoozedUntilDistanceMeters: 9_999_999,
      }),
      {
        wear: { distanceMeters: 100_000, movingTimeMinutes: 0 },
        lastServiceAt: Date.UTC(2026, 0, 1),
        lastServiceWear: { distanceMeters: 0, movingTimeMinutes: 0 },
        taskCreatedAt: Date.UTC(2026, 0, 1),
      },
      Date.UTC(2026, 1, 5),
    );
    expect(result.status).toBe("due");
  });

  it("returns needsComponent when no active wear", () => {
    const result = computeTaskDueStatus(
      task(),
      {
        wear: null,
        lastServiceAt: null,
        lastServiceWear: null,
        taskCreatedAt: Date.UTC(2026, 0, 1),
      },
      Date.UTC(2026, 5, 1),
    );
    expect(result.status).toBe("ok");
    expect(result.progress?.needsComponent).toBe(true);
  });

  it("daysBetween counts whole days", () => {
    expect(daysBetween(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 11))).toBe(10);
  });
});
