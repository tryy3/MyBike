import { describe, expect, it } from "vite-plus/test";
import { affectedRows, enumerableNamedRows } from "../db/result.js";

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

/**
 * Mirrors `@tursodatabase/serverless/compat` createRowObject: array row with
 * non-enumerable named column properties. drizzle-orm/libsql's normalizeRow
 * only copies enumerable keys, so these names would otherwise be dropped.
 */
function tursoCompatRow(values: unknown[], columns: string[]): unknown[] {
  const row = [...values];
  columns.forEach((column, index) => {
    Object.defineProperty(row, column, {
      value: values[index],
      enumerable: false,
      writable: false,
      configurable: true,
    });
  });
  return row;
}

/** Same filter drizzle-orm/libsql uses after execute(). */
function normalizeRowLikeDrizzle(obj: object): Record<string, unknown> {
  return Object.keys(obj).reduce<Record<string, unknown>>((acc, key) => {
    if (Object.prototype.propertyIsEnumerable.call(obj, key))
      acc[key] = (obj as Record<string, unknown>)[key];
    return acc;
  }, {});
}

describe("enumerableNamedRows", () => {
  it("makes Turso compat column names survive drizzle normalizeRow", () => {
    const columns = ["id", "email", "name", "role"];
    const result = {
      columns,
      rows: [tursoCompatRow(["u1", "a@example.com", "Ada", "admin"], columns)],
      rowsAffected: 0,
    };

    const [row] = enumerableNamedRows(result).rows as object[];
    const normalized = normalizeRowLikeDrizzle(row!);

    expect(normalized.name).toBe("Ada");
    expect(normalized.email).toBe("a@example.com");
    expect(normalized.id).toBe("u1");
    expect(normalized.role).toBe("admin");
  });

  it("keeps array index access for mapped select() queries", () => {
    const columns = ["id", "name"];
    const result = {
      columns,
      rows: [tursoCompatRow(["u1", "Ada"], columns)],
      rowsAffected: 0,
    };

    const [row] = enumerableNamedRows(result).rows as unknown[][];
    expect(row![0]).toBe("u1");
    expect(row![1]).toBe("Ada");
  });

  it("preserves null column values", () => {
    const columns = ["id", "name"];
    const result = {
      columns,
      rows: [tursoCompatRow(["u1", null], columns)],
      rowsAffected: 0,
    };

    const [row] = enumerableNamedRows(result).rows as object[];
    expect(normalizeRowLikeDrizzle(row!).name).toBeNull();
  });

  it("maps pure array rows by column index", () => {
    const columns = ["id", "name"];
    const result = {
      columns,
      rows: [["u1", "Ada"]],
      rowsAffected: 0,
    };

    const [row] = enumerableNamedRows(result).rows as object[];
    const normalized = normalizeRowLikeDrizzle(row!);
    expect(normalized).toMatchObject({ id: "u1", name: "Ada" });
    expect((row as unknown[])[0]).toBe("u1");
  });
});
