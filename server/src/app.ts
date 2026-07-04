import express from "express";
import { toNodeHandler } from "better-auth/node";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bikesRouter from "./routes/bikes.js";
import componentsRouter from "./routes/components.js";
import fieldSuggestionsRouter from "./routes/field-suggestions.js";
import { errorHandler } from "./lib/errors.js";
import { auth } from "./lib/auth.js";
import { sqlite } from "./db/index.js";

const IMPORT_MAX_BYTES = 256 * 1024;
const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Better Auth must be mounted before express.json() (it parses its own body).
  app.all("/api/auth/{*any}", toNodeHandler(auth));

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
  app.use("/api/field-suggestions", fieldSuggestionsRouter);

  if (process.env.NODE_ENV === "production") {
    const clientDistPath = resolve(__dirname, "../../client/dist");
    const clientIndexPath = join(clientDistPath, "index.html");

    if (existsSync(clientIndexPath)) {
      app.use(express.static(clientDistPath));
      app.get("/{*splat}", (req, res, next) => {
        if (req.path.startsWith("/api")) {
          next();
          return;
        }

        res.sendFile(clientIndexPath);
      });
    }
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
}
