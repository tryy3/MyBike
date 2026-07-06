import express from "express";
import { webhookRouter } from "./routes/webhook.js";
import { eventsRouter } from "./routes/events.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "16kb" }));

  app.use("/webhook", webhookRouter);
  app.use("/api", eventsRouter);

  return app;
}
