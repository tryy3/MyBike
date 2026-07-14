import "../src/load-env.js";
import { initDatabase } from "../src/db/index.js";
import { applyMigrations } from "../src/db/migrate.js";

await initDatabase();
await applyMigrations();

console.log("Migrations applied successfully.");
