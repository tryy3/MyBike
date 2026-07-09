import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { getLog } from "./logging/index.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const log = req.log ?? getLog();

  if (err instanceof ZodError) {
    log.debug({ issueCount: err.issues.length }, "Validation failed");
    res.status(400).json({ error: "Validation failed", details: err.issues });
    return;
  }
  log.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
