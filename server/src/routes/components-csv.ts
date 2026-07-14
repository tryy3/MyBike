import { Router } from "express";
import { componentImportSchema } from "shared";
import { exportComponentsCsv, importComponentsFromCsv } from "../services/component-import.js";
import { HttpError } from "../lib/errors.js";
import { requireAuth, getAuthContext } from "../lib/require-auth.js";
import { parseBody, parseParams } from "../lib/validation.js";

export const componentsCsvRouter = Router({ mergeParams: true });

componentsCsvRouter.use(requireAuth);

componentsCsvRouter.get("/export.csv", async (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  const { csv, filename } = await exportComponentsCsv(bikeId, userId);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

componentsCsvRouter.post("/import", async (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, ["bikeId"]);
  const { csv: csvText, dryRun = false } = parseBody(req, componentImportSchema);
  try {
    const result = await importComponentsFromCsv(bikeId, userId, csvText, dryRun);
    if (result.dryRun) {
      req.log.debug(
        { bikeId, userId, inserted: result.inserted, updated: result.updated, dryRun: true },
        "Component CSV import dry-run",
      );
      res.status(200).json(result);
      return;
    }
    req.log.info(
      { bikeId, userId, inserted: result.inserted, updated: result.updated },
      "Component CSV import complete",
    );
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof HttpError && err.status === 400 && Array.isArray(err.details)) {
      req.log.debug(
        { errorCount: err.details.length, bikeId, userId },
        "Component CSV import validation failed",
      );
    }
    throw err;
  }
});

export default componentsCsvRouter;
