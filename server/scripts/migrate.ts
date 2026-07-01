import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/db/index";

migrate(db, { migrationsFolder: "./drizzle" });

console.log("Migrations applied successfully.");