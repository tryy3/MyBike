import { runDrizzleMigrations as runSharedDrizzleMigrations } from "shared";
import { child } from "../lib/logging/index.js";
import type { AppDb } from "./index.js";

const log = child({ component: "db" });

/** Proxy wrapper: shared Turso-safe migrator + structured repair logging. */
export async function runDrizzleMigrations(
  db: AppDb,
  migrationsFolder: string,
  migrationsTable?: string,
): Promise<void> {
  await runSharedDrizzleMigrations(db, migrationsFolder, {
    migrationsTable,
    onRepair: ({ migration, tables }) => {
      log.warn(
        { migration, tables },
        "Re-applying migration whose journal row exists but CREATE TABLE objects are missing",
      );
    },
  });
}

export {
  ensureMigrationsTableV1,
  extractCreatedTableNames,
  isBenignSchemaError,
  isDuplicateColumnError,
  isNoSuchColumnError,
  resolveMigrationsToRun,
} from "shared";
