import express from "express";
import { toNodeHandler } from "better-auth/node";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import componentsCsvRouter from "./routes/components-csv.js";
import stravaRouter from "./routes/strava.js";
import { activityRouter, bikeActivitiesRouter } from "./routes/activities.js";
import { errorHandler } from "./lib/errors.js";
import { auth } from "./lib/auth.js";
import { httpLogger } from "./lib/logging/index.js";
import { sqlite } from "./db/index.js";
import { createGraphQLYoga } from "./graphql/yoga.js";

const IMPORT_MAX_BYTES = 256 * 1024;
const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(httpLogger);

  // Better Auth must be mounted before express.json() (it parses its own body).
  app.all("/api/auth/{*any}", toNodeHandler(auth));

  app.use(express.json({ limit: `${IMPORT_MAX_BYTES + 64 * 1024}b` }));

  const yoga = createGraphQLYoga();
  app.use("/graphql", (req, res) => {
    void yoga(req, res);
  });

  app.get("/api/health", (_req, res) => {
    try {
      sqlite.prepare("SELECT 1").get();
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "error", error: "Database unavailable" });
    }
  });

  app.use("/api/bikes/:bikeId/components", componentsCsvRouter);
  app.use("/api/strava", stravaRouter);
  app.use("/api/bikes/:bikeId/activities", bikeActivitiesRouter);
  app.use("/api/activities", activityRouter);

  if (process.env.NODE_ENV === "production") {
    const clientDistPath = resolve(__dirname, "../../client/dist");
    const clientIndexPath = join(clientDistPath, "index.html");

    if (existsSync(clientIndexPath)) {
      app.use(express.static(clientDistPath));
      app.get("/{*splat}", (req, res, next) => {
        if (req.path.startsWith("/api") || req.path.startsWith("/graphql")) {
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
