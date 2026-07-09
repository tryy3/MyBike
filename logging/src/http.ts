import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequestHandler } from "express";
import type { Logger } from "pino";
import pinoHttp from "pino-http";

export interface HttpLoggerOptions {
  healthCheckPaths?: string[];
}

function resolveRequestId(req: IncomingMessage): string {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  if (Array.isArray(header) && header[0]) {
    return header[0];
  }
  return randomUUID();
}

function customLogLevel(
  _req: IncomingMessage,
  res: ServerResponse,
  err?: Error,
): "info" | "warn" | "error" {
  if (err || res.statusCode >= 500) {
    return "error";
  }
  if (res.statusCode >= 400) {
    return "warn";
  }
  return "info";
}

export function createHttpLogger(logger: Logger, options: HttpLoggerOptions = {}): RequestHandler {
  const healthCheckPaths = new Set(options.healthCheckPaths ?? []);

  return pinoHttp({
    logger,
    genReqId: resolveRequestId,
    customLogLevel,
    autoLogging: {
      ignore: (req) => (req.url ? healthCheckPaths.has(req.url) : false),
    },
    customProps: (req) => ({
      requestId: req.id,
    }),
  });
}
