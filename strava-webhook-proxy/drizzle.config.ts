import { defineConfig } from "drizzle-kit";

const dbPath = process.env.STRAVA_WEBHOOK_PROXY_DB_PATH ?? "./data/strava-webhook-proxy.db";

export default defineConfig({
  schema: ["./src/db/schema.ts"],
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
  verbose: true,
  strict: true,
});
