import "./load-env.js";
import type { Server } from "node:http";
import { flushLogs, initLogging, logger } from "./lib/logging/index.js";

let server: Server | undefined;
let webhookPollTimer: ReturnType<typeof setInterval> | undefined;
const runtimeCleanup: Array<() => void> = [];

function clearWebhookPolling(): void {
  if (webhookPollTimer) {
    clearInterval(webhookPollTimer);
    webhookPollTimer = undefined;
  }
}

async function main(): Promise<void> {
  const { initDatabase } = await import("./db/index.js");
  await initDatabase();

  // DB connect + migrations run before app config can load (config is
  // DB-backed), so the config-backed logger isn't ready yet — this path logs
  // to console rather than the shared logger.
  const { applyMigrations } = await import("./db/migrate.js");
  if (process.env.RUN_MIGRATIONS === "true") {
    await applyMigrations();
    console.info("Migrations applied successfully");
  }

  const { appConfig } = await import("./services/app-config.js");
  const { applyProcessLoggerLevel, syncAuthEnvFromConfig, syncLoggingEnvFromConfig } =
    await import("./lib/runtime-config.js");

  await appConfig.load();
  await appConfig.markBootComplete();

  syncLoggingEnvFromConfig(appConfig);
  initLogging();

  runtimeCleanup.push(applyProcessLoggerLevel(appConfig));

  const { getStravaWebhookProxyApiKey, getStravaWebhookProxyUrl } =
    await import("./lib/strava-event-source.js");
  const { processPendingWebhookEvents, refreshStravaEventSource } =
    await import("./lib/strava-webhook-poller.js");

  function startWebhookPolling(): void {
    clearWebhookPolling();
    const eventSource = refreshStravaEventSource();
    if (!eventSource) {
      const missingSettingKeys = [
        !getStravaWebhookProxyUrl() ? "strava.webhook.proxyUrl" : null,
        !getStravaWebhookProxyApiKey() ? "strava.webhook.proxyApiKey" : null,
      ].filter((name): name is string => name !== null);
      logger.info(
        { component: "strava-webhook", missingSettingKeys },
        "Webhook proxy not configured; polling disabled",
      );
      return;
    }

    const intervalMs = appConfig.get<number>("strava.webhook.pollIntervalMs");
    const poll = () => {
      void processPendingWebhookEvents().catch((err) => {
        logger.error({ err, component: "strava-webhook" }, "Webhook poll failed");
      });
    };
    webhookPollTimer = setInterval(poll, intervalMs);
    poll();
    logger.info({ intervalMs, component: "strava-webhook" }, "Polling Strava webhook proxy");
  }

  runtimeCleanup.push(
    appConfig.onChange("strava.webhook.pollIntervalMs", () => {
      startWebhookPolling();
    }),
  );
  runtimeCleanup.push(
    appConfig.onChange("strava.webhook.proxyApiKey", () => {
      startWebhookPolling();
    }),
  );
  runtimeCleanup.push(
    appConfig.onChange("strava.webhook.proxyUrl", () => {
      startWebhookPolling();
    }),
  );
  runtimeCleanup.push(
    appConfig.onChange("strava.webhook.subscriptionId", () => {
      startWebhookPolling();
    }),
  );

  syncAuthEnvFromConfig(appConfig);

  const { createApp } = await import("./app.js");
  const app = createApp();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

  server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
    startWebhookPolling();
  });
}

function shutdown(signal: string): void {
  initLogging();
  logger.info({ signal }, "Shutting down");
  clearWebhookPolling();
  for (const cleanup of runtimeCleanup.splice(0)) {
    cleanup();
  }
  server?.close(() => {
    flushLogs(() => {
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

void main().catch((err) => {
  // main() may fail before initLogging() runs (e.g. DB connect failure);
  // initLogging() is idempotent, so calling it here guarantees the fatal
  // error is captured by the real logger rather than being lost.
  initLogging();
  logger.fatal({ err }, "Server failed to start");
  flushLogs(() => {
    process.exit(1);
  });
});
