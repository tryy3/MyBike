import { describe, expect, it } from "vite-plus/test";
import {
  hoursMinutesToMinutes,
  kmInputToMeters,
  metersToKmInput,
  minutesToHoursMinutes,
} from "./form-utils";

describe("form-utils", () => {
  it("converts meters and km", () => {
    expect(metersToKmInput(2400500)).toBe("2400.5");
    expect(metersToKmInput(2400000)).toBe("2400");
    expect(kmInputToMeters("2400.5")).toBe(2400500);
    expect(kmInputToMeters("")).toBeNull();
  });

  it("converts moving time minutes and hours/minutes", () => {
    expect(minutesToHoursMinutes(125)).toEqual({ hours: "2", minutes: "5" });
    expect(hoursMinutesToMinutes("2", "5")).toBe(125);
    expect(hoursMinutesToMinutes("", "")).toBeNull();
  });
});
