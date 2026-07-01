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

import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.issues });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}