import express from "express";
import bikesRouter from "./routes/bikes";
import componentsRouter from "./routes/components";
import { errorHandler } from "./lib/errors";
import { sqlite } from "./db/index";

const IMPORT_MAX_BYTES = 256 * 1024;

export function createApp() {
  const app = express();

  app.use(express.json({ limit: `${IMPORT_MAX_BYTES + 64 * 1024}b` }));

  app.get("/api/health", (_req, res) => {
    try {
      sqlite.prepare("SELECT 1").get();
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "error", error: "Database unavailable" });
    }
  });

  app.use("/api/bikes", bikesRouter);
  app.use("/api/bikes/:bikeId/components", componentsRouter);
  app.use("/api/components", componentsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
}
