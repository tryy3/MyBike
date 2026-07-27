import { describe, expect, it } from "vite-plus/test";
import {
  errorMessageChain,
  extractCreatedTableNames,
  isBenignSchemaError,
  isCreateIndexMissingColumnError,
  isDataMigrationStatement,
  isDuplicateColumnError,
  isNoSuchColumnError,
  normalizeDriverRow,
  resolveMigrationsToRun,
} from "./run-migrations.js";

describe("resolveMigrationsToRun", () => {
  it("skips migrations already recorded by hash when name is null", () => {
    const local = [
      {
        sql: ["CREATE TABLE a"],
        hash: "hash-a",
        folderMillis: 1,
        name: "20260101000000_a",
      },
      {
        sql: ["CREATE TABLE b"],
        hash: "hash-b",
        folderMillis: 2,
        name: "20260101000001_b",
      },
    ];

    const pending = resolveMigrationsToRun(local, [
      {
        id: 1,
        hash: local[0]!.hash,
        created_at: 1,
        name: null,
      },
    ]);

    expect(pending.map((m) => m.name)).toEqual(["20260101000001_b"]);
  });
});

describe("migration helpers", () => {
  it("extracts CREATE TABLE names from migration SQL", () => {
    expect(
      extractCreatedTableNames([
        "CREATE TABLE `apikey` (\n  id text\n);\n",
        'CREATE TABLE "strava_webhook_cursor" (id integer);',
      ]),
    ).toEqual(["apikey", "strava_webhook_cursor"]);
  });

  it("detects benign schema errors including nested Drizzle causes", () => {
    expect(isBenignSchemaError(new Error("table `bikes` already exists"))).toBe(true);
    expect(isBenignSchemaError(new Error("duplicate column name: name"))).toBe(true);
    expect(isBenignSchemaError(new Error("no such table: apikey"))).toBe(false);

    const nested = new Error("Failed to run the query 'CREATE TABLE bikes'");
    nested.cause = new Error("prepare failed: Parse error: table bikes already exists");
    expect(isBenignSchemaError(nested)).toBe(true);
  });

  it("detects duplicate column errors from Turso / SQLite messages", () => {
    expect(
      isDuplicateColumnError(
        new Error(
          "SQLite error: duplicate column name: name: SQLite error: duplicate column name: name",
        ),
      ),
    ).toBe(true);
    expect(isDuplicateColumnError(new Error("something else"))).toBe(false);
  });

  it("detects no such column errors", () => {
    expect(isNoSuchColumnError(new Error("SQLite error: no such column: name"))).toBe(true);
    expect(isNoSuchColumnError(new Error("duplicate column name: name"))).toBe(false);
  });

  it("joins nested error messages", () => {
    const err = new Error("outer");
    err.cause = new Error("inner already exists");
    expect(errorMessageChain(err)).toContain("outer");
    expect(errorMessageChain(err)).toContain("inner already exists");
  });

  it("detects one-time data migration statements", () => {
    expect(isDataMigrationStatement("DELETE FROM `bikes`;")).toBe(true);
    expect(isDataMigrationStatement("UPDATE `components` SET x = 1;")).toBe(true);
    expect(isDataMigrationStatement("DROP INDEX `idx`;")).toBe(false);
    expect(isDataMigrationStatement("CREATE TABLE `user` (id text);")).toBe(false);
    expect(isDataMigrationStatement("-- Existing bikes have no owner\nDELETE FROM `bikes`;")).toBe(
      true,
    );
  });

  it("maps Turso array-like driver rows onto named columns", () => {
    const row = { 0: 1, 1: "abc", 2: 99, 3: "mig_a" };
    expect(normalizeDriverRow(row, ["id", "hash", "created_at", "migration_name"])).toEqual({
      id: 1,
      hash: "abc",
      created_at: 99,
      migration_name: "mig_a",
    });
    expect(
      normalizeDriverRow({ id: 2, hash: "named", created_at: 1, migration_name: "x" }, [
        "id",
        "hash",
        "created_at",
        "migration_name",
      ]),
    ).toEqual({ id: 2, hash: "named", created_at: 1, migration_name: "x" });
  });

  it("treats CREATE INDEX on a missing column as benign", () => {
    const err = new Error("SQLite input error: no such column: account_id");
    expect(
      isCreateIndexMissingColumnError(
        "CREATE UNIQUE INDEX `idx_account_provider_account` ON `account` (`provider_id`,`account_id`);",
        err,
      ),
    ).toBe(true);
    expect(isCreateIndexMissingColumnError("ALTER TABLE account ADD issuer text;", err)).toBe(
      false,
    );
  });
});
