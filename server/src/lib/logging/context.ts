import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "pino";
import { logger } from "./transport.js";

const logContextStorage = new AsyncLocalStorage<Record<string, unknown>>();

export function withLogContext<T>(bindings: Record<string, unknown>, fn: () => T): T {
  const parent = logContextStorage.getStore() ?? {};
  return logContextStorage.run({ ...parent, ...bindings }, fn);
}

export function getLog(): Logger {
  const context = logContextStorage.getStore();
  if (!context || Object.keys(context).length === 0) {
    return logger;
  }
  return logger.child(context);
}
