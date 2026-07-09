import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogging } from "logging";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export const { logger, httpLogger, child, getLog, withLogContext, flushLogs } = createLogging({
  service: "mybike-strava-webhook-proxy",
  defaultLogFilePath: resolve(repoRoot, "strava-webhook-proxy/data/proxy.log"),
});
