import express from "express";
import bikesRouter from "./routes/bikes";
import slotsRouter from "./routes/component-slots";
import optionsRouter from "./routes/component-options";
import { errorHandler } from "./lib/errors";

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/bikes", bikesRouter);
// Slot creation is nested under a bike; slot updates/deletes are flat.
app.use("/api/bikes/:bikeId/slots", slotsRouter);
app.use("/api/slots", slotsRouter);
// Option creation is nested under a slot; option updates/activate/delete flat.
app.use("/api/slots/:slotId/options", optionsRouter);
app.use("/api/options", optionsRouter);

// 404 handler for unknown routes.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});