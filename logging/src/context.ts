import { AsyncLocalStorage } from "node:async_hooks";
import type { Bindings, Logger } from "pino";

export interface LogContextHelpers {
  withLogContext: <T>(bindings: Record<string, unknown>, fn: () => T) => T;
  getLog: () => Logger;
  child: (bindings: Bindings) => Logger;
}

export function createLogContextHelpers(logger: Logger): LogContextHelpers {
  const logContextStorage = new AsyncLocalStorage<Record<string, unknown>>();

  function withLogContext<T>(bindings: Record<string, unknown>, fn: () => T): T {
    const parent = logContextStorage.getStore() ?? {};
    return logContextStorage.run({ ...parent, ...bindings }, fn);
  }

  function getLog(): Logger {
    const context = logContextStorage.getStore();
    if (!context || Object.keys(context).length === 0) {
      return logger;
    }
    return logger.child(context);
  }

  function child(bindings: Bindings): Logger {
    return logger.child(bindings);
  }

  return { withLogContext, getLog, child };
}
