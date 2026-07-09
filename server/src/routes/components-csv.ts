import { Router } from "express";
import { componentImportSchema } from "shared";
import { exportComponentsCsv, importComponentsFromCsv } from "../services/component-import.js";
import { requireAuth, getAuthContext } from "../lib/require-auth.js";
import { parseBody, parseParams } from "../lib/validation.js";

export const componentsCsvRouter = Router({ mergeParams: true });

componentsCsvRouter.use(requireAuth);

componentsCsvRouter.get("/export.csv", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  const { csv, filename } = exportComponentsCsv(bikeId, userId);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

componentsCsvRouter.post("/import", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  const { csv: csvText, dryRun = false } = parseBody(req, componentImportSchema);
  const result = importComponentsFromCsv(bikeId, userId, csvText, dryRun);
  if (result.dryRun) {
    res.status(200).json(result);
    return;
  }
  res.status(201).json(result);
});

export default componentsCsvRouter;
