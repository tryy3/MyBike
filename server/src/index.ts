import "./load-env.js";
import { createApp } from "./app.js";
import { applyMigrations } from "./db/migrate.js";
import { createStravaEventSource } from "./lib/strava-event-source.js";
import { flushLogs, logger } from "./lib/logging/index.js";
import { processPendingWebhookEvents } from "./lib/strava-webhook-poller.js";

if (process.env.RUN_MIGRATIONS === "true") {
  applyMigrations();
  logger.info("Migrations applied successfully");
}

const app = createApp();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");

  const eventSource = createStravaEventSource();
  if (eventSource) {
    const intervalMs = parseInt(process.env.STRAVA_WEBHOOK_POLL_INTERVAL_MS ?? "60000", 10);
    const poll = () => {
      void processPendingWebhookEvents().catch((err) => {
        logger.error({ err, component: "strava-webhook" }, "Webhook poll failed");
      });
    };
    setInterval(poll, intervalMs);
    poll();
    logger.info({ intervalMs, component: "strava-webhook" }, "Polling Strava webhook proxy");
  }
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
