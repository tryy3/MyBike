import "./load-env.js";
import { createApp } from "./app.js";
import { applyMigrations } from "./db/migrate.js";
import { createStravaEventSource } from "./lib/strava-event-source.js";
import { processPendingWebhookEvents } from "./lib/strava-webhook-poller.js";

if (process.env.RUN_MIGRATIONS === "true") {
  applyMigrations();
  console.log("Migrations applied successfully.");
}

const app = createApp();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);

  const eventSource = createStravaEventSource();
  if (eventSource) {
    const intervalMs = parseInt(process.env.STRAVA_WEBHOOK_POLL_INTERVAL_MS ?? "60000", 10);
    const poll = () => {
      void processPendingWebhookEvents().catch((err) => {
        console.error("[strava-webhook] poll failed:", err);
      });
    };
    setInterval(poll, intervalMs);
    poll();
    console.log(`[strava-webhook] polling proxy every ${intervalMs}ms`);
  }
});
