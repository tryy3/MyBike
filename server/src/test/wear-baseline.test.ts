import { describe, expect, it } from "vite-plus/test";
import { activityDateOnOrAfterCreditFrom, computeBaseline } from "../lib/wear-baseline.js";

describe("computeBaseline", () => {
  it("returns stored minus strava wear floored at zero", () => {
    expect(computeBaseline(600, 500)).toBe(100);
    expect(computeBaseline(500, 500)).toBe(null);
    expect(computeBaseline(100, 500)).toBe(null);
    expect(computeBaseline(null, 0)).toBe(null);
  });
});

describe("activityDateOnOrAfterCreditFrom", () => {
  it("compares ISO date prefixes", () => {
    expect(activityDateOnOrAfterCreditFrom("2026-07-05T10:00:00Z", "2026-07-05")).toBe(true);
    expect(activityDateOnOrAfterCreditFrom("2026-07-04T23:59:59Z", "2026-07-05")).toBe(false);
  });
});
