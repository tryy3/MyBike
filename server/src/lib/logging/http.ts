import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import pinoHttp from "pino-http";
import { logger } from "./transport.js";

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

export const httpLogger = pinoHttp({
  logger,
  genReqId: resolveRequestId,
  customLogLevel,
  autoLogging: {
    ignore: (req) => req.url === "/api/health",
  },
  customProps: (req) => ({
    requestId: req.id,
  }),
});
