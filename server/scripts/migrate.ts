import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { db } from "../src/db/index";

migrate(db, { migrationsFolder: "./drizzle" });

console.log("Migrations applied successfully.");