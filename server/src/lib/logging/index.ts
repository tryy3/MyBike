import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogging, type Logging } from "logging";

type Logger = Logging["logger"];
type HttpLoggerHandler = Logging["httpLogger"];
type ChildBindings = Record<string, unknown>;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

let logging: Logging | null = null;

function requireLogging(): Logging {
  if (!logging) {
    throw new Error("Server logging must be initialized after app config load");
  }
  return logging;
}

/**
 * Creates the real (config-backed) logging instance. Must run after
 * `appConfig.load()` + `syncLoggingEnvFromConfig()` so DB-backed
 * `logging.toFile` / `logging.filePath` / `logging.redact` take effect.
 * Idempotent — safe to call defensively (e.g. from a top-level error handler).
 */
export function initLogging(): void {
  if (logging) return;
  logging = createLogging({
    service: "mybike-server",
    defaultLogFilePath: resolve(repoRoot, "server/data/mybike.log"),
    healthCheckPaths: ["/api/health"],
  });
}

/** Console fallback for the narrow pre-boot window (DB connect + migrations
 * run before app config — and therefore the real logger — can be loaded). */
function createConsoleFallbackLogger(bindings: ChildBindings): Logger {
  const write =
    (method: (...args: unknown[]) => void) =>
    (objOrMsg?: unknown, msg?: string, ...args: unknown[]) => {
      if (typeof objOrMsg === "string") {
        method(objOrMsg, ...args);
        return;
      }
      const extra = objOrMsg && typeof objOrMsg === "object" ? objOrMsg : {};
      method(msg ?? "", { ...bindings, ...extra }, ...args);
    };

  return {
    trace: write(console.debug),
    debug: write(console.debug),
    info: write(console.info),
    warn: write(console.warn),
    error: write(console.error),
    fatal: write(console.error),
    child: (childBindings: ChildBindings) =>
      createConsoleFallbackLogger({ ...bindings, ...childBindings }),
  } as unknown as Logger;
}

/**
 * Wraps a lazily-resolved logger in a Proxy so consumers can hold a stable
 * reference before the real logger exists (module-scope `const log = child(...)`)
 * and still observe live mutations (e.g. `logger.level = "debug"`).
 *
 * Deliberately does NOT forward the proxy `receiver` to Reflect.get/set —
 * pino's `level` is an accessor property, and invoking its getter/setter with
 * `this` bound to the proxy (instead of the real logger) breaks it silently.
 * `getOwnPropertyDescriptor`/`has` forward too so tools like `vi.spyOn` — which
 * check for an "own" property before patching — work against the proxy.
 */
function createLazyLoggerProxy(resolveTarget: () => Logger): Logger {
  return new Proxy({} as Logger, {
    get(_target, prop) {
      return Reflect.get(resolveTarget(), prop);
    },
    set(_target, prop, value) {
      return Reflect.set(resolveTarget(), prop, value);
    },
    has(_target, prop) {
      return Reflect.has(resolveTarget(), prop);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const desc = Reflect.getOwnPropertyDescriptor(resolveTarget(), prop);
      // The proxy's own backing object has no properties, so any descriptor
      // we report must stay configurable to satisfy the Proxy invariants.
      return desc ? { ...desc, configurable: true } : undefined;
    },
    // `vi.spyOn`/`mockRestore` patch methods via defineProperty rather than
    // plain assignment — forward it to the real logger so spies observe (and
    // restores affect) the object callers actually log through.
    defineProperty(_target, prop, descriptor) {
      return Reflect.defineProperty(resolveTarget(), prop, descriptor);
    },
  }) as Logger;
}

export const logger = createLazyLoggerProxy(() => requireLogging().logger);

export const httpLogger: HttpLoggerHandler = ((req, res, next) => {
  requireLogging().httpLogger(req, res, next);
}) as HttpLoggerHandler;

/**
 * Component logger. Bound lazily: modules that construct one at import time
 * (e.g. `db/index.ts`, which runs before app config can load) get a console
 * fallback on first use; anything created after `initLogging()` gets the real
 * pino child. The resolved target is cached on first property access.
 */
export function child(bindings: ChildBindings): Logger {
  let resolved: Logger | null = null;
  return createLazyLoggerProxy(() => {
    if (!resolved) {
      resolved = logging ? logging.child(bindings) : createConsoleFallbackLogger(bindings);
    }
    return resolved;
  });
}

export function getLog(): Logger {
  return requireLogging().getLog();
}

export function withLogContext<T>(bindings: ChildBindings, fn: () => T): T {
  return requireLogging().withLogContext(bindings, fn);
}

export function flushLogs(callback?: () => void): void {
  if (!logging) {
    callback?.();
    return;
  }
  logging.flushLogs(callback);
}

export function setLoggerLevel(level: string): void {
  requireLogging().logger.level = level;
}
