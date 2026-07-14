import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { connect } from "@tursodatabase/database";
import { drizzle } from "drizzle-orm/tursodatabase/database";
import {
  ensureMigrationsTableV1,
  isDuplicateColumnError,
  isNoSuchColumnError,
  runDrizzleMigrations,
} from "../db/run-migrations.js";
import type { AppDb } from "../db/index.js";

describe("runDrizzleMigrations", () => {
  let db: AppDb;
  let client: Awaited<ReturnType<typeof connect>>;
  let migrationsFolder: string;

  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), "mybike-migrate-"));
    client = await connect(join(dir, "test.db"));
    db = drizzle({ client }) as AppDb;
    migrationsFolder = join(import.meta.dirname, "../../drizzle");
  });

  afterEach(async () => {
    await client.close();
  });

  it("applies migrations to an empty database and is idempotent", async () => {
    await runDrizzleMigrations(db, migrationsFolder);
    await runDrizzleMigrations(db, migrationsFolder);

    const tables = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bikes'`,
    );
    expect(tables).toHaveLength(1);

    const applied = await db.all<{ name: string }>(
      sql`SELECT name FROM __drizzle_migrations WHERE name IS NOT NULL`,
    );
    expect(applied.length).toBeGreaterThan(0);
  });

  it("does not try to re-add name column when migrations table is already v1", async () => {
    await db.run(sql`
      CREATE TABLE __drizzle_migrations (
        id INTEGER PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric,
        name text,
        applied_at TEXT
      )
    `);

    await runDrizzleMigrations(db, migrationsFolder);

    await expect(ensureMigrationsTableV1(db, "__drizzle_migrations")).resolves.toBeUndefined();
  });

  it("upgrades a v0 migrations table and ignores duplicate-column retries", async () => {
    await db.run(sql`
      CREATE TABLE __drizzle_migrations (
        id INTEGER PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )
    `);

    await ensureMigrationsTableV1(db, "__drizzle_migrations");
    await ensureMigrationsTableV1(db, "__drizzle_migrations");

    await db.run(sql.raw(`SELECT "name", "applied_at" FROM "__drizzle_migrations" LIMIT 0`));
  });
});

describe("migration error helpers", () => {
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
});
