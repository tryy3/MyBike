import { applyMigrations } from "../src/db/migrate.js";

applyMigrations();

console.log("Migrations applied successfully.");