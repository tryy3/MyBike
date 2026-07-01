import express from "express";
import bikesRouter from "./routes/bikes";
import componentsRouter from "./routes/components";
import { errorHandler } from "./lib/errors";

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/bikes", bikesRouter);
// Component creation is nested under a bike; component updates/activate/delete
// are flat.
app.use("/api/bikes/:bikeId/components", componentsRouter);
app.use("/api/components", componentsRouter);

// 404 handler for unknown routes.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});