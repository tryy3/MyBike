import { defineConfig } from "drizzle-kit";

const dbPath = process.env.DB_PATH ?? "./data/mybike.db";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
  verbose: true,
  strict: true,
});