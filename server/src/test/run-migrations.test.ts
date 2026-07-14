import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { connect } from "@tursodatabase/database";
import { drizzle } from "drizzle-orm/tursodatabase/database";
import { runDrizzleMigrations } from "../db/run-migrations.js";
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

    // Pretend all folder migrations are already recorded (so nothing to run).
    // Still must succeed ensureMigrationsTableV1 without ADD COLUMN errors.
    await runDrizzleMigrations(db, migrationsFolder);

    const cols = await db.all<{ name: string }>(
      sql.raw(`SELECT name FROM pragma_table_info('__drizzle_migrations')`),
    );
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining(["id", "hash", "created_at", "name", "applied_at"]),
    );
  });
});
