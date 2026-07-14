import { describe, expect, it } from "vite-plus/test";
import { affectedRows } from "../db/result.js";

describe("affectedRows", () => {
  it("prefers local Turso Database `changes`", () => {
    expect(affectedRows({ changes: 1, rowsAffected: 0 })).toBe(1);
  });

  it("falls back to remote libSQL `rowsAffected`", () => {
    expect(affectedRows({ rowsAffected: 2 })).toBe(2);
  });

  it("treats missing counts as zero", () => {
    expect(affectedRows({})).toBe(0);
  });

  it("coerces bigint counts", () => {
    expect(affectedRows({ changes: 3n })).toBe(3);
  });
});
