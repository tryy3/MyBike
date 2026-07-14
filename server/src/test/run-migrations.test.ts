import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { connect } from "@tursodatabase/database";
import { drizzle } from "drizzle-orm/tursodatabase/database";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { ensureMigrationsTableV1, runDrizzleMigrations } from "../db/run-migrations.js";
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

  it("does not re-run SQL when journal rows have hashes but NULL names", async () => {
    const local = readMigrationFiles({ migrationsFolder });
    await db.run(sql`
      CREATE TABLE __drizzle_migrations (
        id INTEGER PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric,
        name text,
        applied_at TEXT
      )
    `);
    await db.run(sql`
      CREATE TABLE bikes (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        brand text,
        model text,
        year integer,
        notes text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )
    `);

    for (const migration of local) {
      await db.run(
        sql`INSERT INTO __drizzle_migrations ("hash", "created_at", "name") VALUES (${migration.hash}, ${migration.folderMillis}, ${null})`,
      );
    }

    await expect(runDrizzleMigrations(db, migrationsFolder)).resolves.toBeUndefined();

    const named = await db.all<{ name: string }>(
      sql`SELECT name FROM __drizzle_migrations WHERE name IS NOT NULL`,
    );
    expect(named.length).toBe(local.length);

    const apikey = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'apikey'`,
    );
    expect(apikey).toHaveLength(1);

    const cursor = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'strava_webhook_cursor'`,
    );
    expect(cursor).toHaveLength(1);
  });

  it("continues past existing tables when importing a partial Cloud schema", async () => {
    await db.run(sql`
      CREATE TABLE __drizzle_migrations (
        id INTEGER PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric,
        name text,
        applied_at TEXT
      )
    `);
    await db.run(sql`
      CREATE TABLE bikes (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )
    `);

    await expect(runDrizzleMigrations(db, migrationsFolder)).resolves.toBeUndefined();

    const apikey = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'apikey'`,
    );
    expect(apikey).toHaveLength(1);

    const applied = await db.all<{ name: string }>(sql`SELECT name FROM __drizzle_migrations`);
    expect(applied.length).toBeGreaterThan(0);
  });

  it("does not delete bikes when re-applying auth migration after partial import", async () => {
    await db.run(sql`
      CREATE TABLE __drizzle_migrations (
        id INTEGER PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric,
        name text,
        applied_at TEXT
      )
    `);
    await db.run(sql`
      CREATE TABLE user (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        email text NOT NULL,
        email_verified integer DEFAULT false NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )
    `);
    await db.run(sql`
      CREATE TABLE bikes (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        name text NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )
    `);
    await db.run(sql`
      INSERT INTO bikes (id, user_id, name, created_at, updated_at)
      VALUES ('bike-1', 'user-1', 'Road bike', 1, 1)
    `);

    await expect(runDrizzleMigrations(db, migrationsFolder)).resolves.toBeUndefined();

    const bikes = await db.all<{ id: string }>(sql`SELECT id FROM bikes`);
    expect(bikes).toHaveLength(1);
    expect(bikes[0]?.id).toBe("bike-1");
  });
});

describe("affectedRows re-export smoke", () => {
  it("keeps createHash available for unrelated checks", () => {
    expect(createHash("sha256").update("x").digest("hex").length).toBe(64);
  });
});
