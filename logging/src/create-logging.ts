import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { createLogContextHelpers } from "./context.js";
import type { LoggingPackageOptions } from "./config.js";
import { createHttpLogger, type HttpLoggerOptions } from "./http.js";
import { createLogger } from "./transport.js";

export interface CreateLoggingOptions extends LoggingPackageOptions, HttpLoggerOptions {}

export interface Logging {
  logger: Logger;
  httpLogger: RequestHandler;
  child: (bindings: Record<string, unknown>) => Logger;
  getLog: () => Logger;
  withLogContext: <T>(bindings: Record<string, unknown>, fn: () => T) => T;
  flushLogs: (callback?: () => void) => void;
}

export function createLogging(options: CreateLoggingOptions): Logging {
  const logger = createLogger(options);
  const { child, getLog, withLogContext } = createLogContextHelpers(logger);
  const httpLogger = createHttpLogger(logger, options);

  return {
    logger,
    httpLogger,
    child,
    getLog,
    withLogContext,
    flushLogs: (callback) => {
      logger.flush(callback);
    },
  };
}
