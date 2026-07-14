import "./load-env.js";
import type { Server } from "node:http";
import { flushLogs, logger } from "./lib/logging/index.js";

let server: Server | undefined;

async function main(): Promise<void> {
  const { initDatabase } = await import("./db/index.js");
  await initDatabase();

  const { applyMigrations } = await import("./db/migrate.js");
  const { createApp } = await import("./app.js");
  const { createStravaEventSource } = await import("./lib/strava-event-source.js");
  const { processPendingWebhookEvents } = await import("./lib/strava-webhook-poller.js");

  if (process.env.RUN_MIGRATIONS === "true") {
    await applyMigrations();
    logger.info("Migrations applied successfully");
  }

  const app = createApp();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

  server = app.listen(port, () => {
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
    } else {
      const missingEnvVars = [
        !process.env.STRAVA_WEBHOOK_PROXY_URL ? "STRAVA_WEBHOOK_PROXY_URL" : null,
        !process.env.STRAVA_WEBHOOK_PROXY_API_KEY ? "STRAVA_WEBHOOK_PROXY_API_KEY" : null,
      ].filter((name): name is string => name !== null);
      logger.info(
        { component: "strava-webhook", missingEnvVars },
        "Webhook proxy not configured; polling disabled",
      );
    }
  });
}

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  server?.close(() => {
    flushLogs(() => {
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

void main().catch((err) => {
  logger.fatal({ err }, "Server failed to start");
  flushLogs(() => {
    process.exit(1);
  });
});
