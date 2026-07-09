import "./load-env.js";
import { createApp } from "./app.js";
import { applyMigrations } from "./db/migrate.js";
import { flushLogs, logger } from "./lib/logging/index.js";

if (process.env.RUN_MIGRATIONS === "true") {
  applyMigrations();
  logger.info("Migrations applied successfully");
}

const app = createApp();
const port = process.env.STRAVA_WEBHOOK_PROXY_PORT
  ? parseInt(process.env.STRAVA_WEBHOOK_PROXY_PORT, 10)
  : 3002;

const server = app.listen(port, () => {
  logger.info({ port }, "Strava webhook proxy listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    flushLogs(() => {
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
