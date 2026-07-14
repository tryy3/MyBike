import "./load-env.js";
import type { Server } from "node:http";
import { flushLogs, logger } from "./lib/logging/index.js";

let server: Server | undefined;

async function main(): Promise<void> {
  const { initDatabase } = await import("./db/index.js");
  await initDatabase();

  const { applyMigrations } = await import("./db/migrate.js");
  const { createApp } = await import("./app.js");

  if (process.env.RUN_MIGRATIONS === "true") {
    await applyMigrations();
    logger.info("Migrations applied successfully");
  }

  const app = createApp();
  const port = process.env.STRAVA_WEBHOOK_PROXY_PORT
    ? parseInt(process.env.STRAVA_WEBHOOK_PROXY_PORT, 10)
    : 3002;

  server = app.listen(port, () => {
    logger.info({ port }, "Strava webhook proxy listening");
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
  logger.fatal({ err }, "Strava webhook proxy failed to start");
  flushLogs(() => {
    process.exit(1);
  });
});
