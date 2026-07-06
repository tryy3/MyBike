import "./load-env.js";
import { createApp } from "./app.js";
import { applyMigrations } from "./db/migrate.js";

if (process.env.RUN_MIGRATIONS === "true") {
  applyMigrations();
  console.log("Migrations applied successfully.");
}

const app = createApp();
const port = process.env.STRAVA_WEBHOOK_PROXY_PORT
  ? parseInt(process.env.STRAVA_WEBHOOK_PROXY_PORT, 10)
  : 3002;

app.listen(port, () => {
  console.log(`Strava webhook proxy listening on port ${port}`);
});
