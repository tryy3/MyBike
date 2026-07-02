import { applyMigrations } from "../src/db/migrate";

applyMigrations();

console.log("Migrations applied successfully.");