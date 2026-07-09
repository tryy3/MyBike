import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogging } from "logging";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export const { logger, httpLogger, child, getLog, withLogContext, flushLogs } = createLogging({
  service: "mybike-server",
  defaultLogFilePath: resolve(repoRoot, "server/data/mybike.log"),
  healthCheckPaths: ["/api/health"],
});
