import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { getLog } from "./logging/index.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFound(resource = "Resource"): HttpError {
  return new HttpError(404, `${resource} not found`);
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const log = req.log ?? getLog();

  if (err instanceof HttpError) {
    if (err.status >= 500) {
      log.error({ err, status: err.status }, err.message);
    } else if (err.status === 409 && err.message.includes("Strava session expired")) {
      log.warn({ err, status: err.status }, err.message);
    }
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    log.debug({ issueCount: err.issues.length }, "Validation failed");
    res.status(400).json({ error: "Validation failed", details: err.issues });
    return;
  }
  log.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
