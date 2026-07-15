import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { createLogContextHelpers } from "./context.js";
import { getLoggingConfig, type LoggingPackageOptions } from "./config.js";
import { createHttpLogger, type HttpLoggerOptions } from "./http.js";
import { createLoggerFromConfig } from "./transport.js";

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
  const config = getLoggingConfig(options);
  const logger = createLoggerFromConfig(config);
  const { child, getLog, withLogContext } = createLogContextHelpers(logger);
  const httpLogger = createHttpLogger(logger, options);

  if (!config.redactEnabled && !config.isTest) {
    logger.warn("Log redaction disabled (LOG_REDACT=false); sensitive fields will appear in logs");
  }

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
