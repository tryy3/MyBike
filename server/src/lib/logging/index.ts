import type { Logger } from "pino";
import type { Bindings } from "pino";
import { getLog, withLogContext } from "./context.js";
import { httpLogger } from "./http.js";
import { LOG_LEVELS } from "./config.js";
import { logger } from "./transport.js";

export { LOG_LEVELS, getLog, httpLogger, logger, withLogContext };

export function child(bindings: Bindings): Logger {
  return logger.child(bindings);
}

export function flushLogs(callback?: () => void): void {
  logger.flush(callback);
}
