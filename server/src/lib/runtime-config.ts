import type { AppConfigService } from "../services/app-config.js";
import { appConfig } from "../services/app-config.js";
import { logger, setLoggerLevel } from "./logging/index.js";

type LevelLogger = {
  level: string;
};

export function applyLoggingLevelConfig(
  config: AppConfigService = appConfig,
  targetLogger: LevelLogger = logger,
): () => void {
  const applyLevel = (value: unknown) => {
    targetLogger.level = String(value);
  };

  applyLevel(config.get("logging.level"));
  return config.onChange("logging.level", applyLevel);
}

export function applyProcessLoggerLevel(config: AppConfigService = appConfig): () => void {
  setLoggerLevel(config.get<string>("logging.level"));
  return config.onChange("logging.level", (value) => {
    setLoggerLevel(String(value));
  });
}

export function syncAuthEnvFromConfig(
  config: AppConfigService = appConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.BETTER_AUTH_URL = config.get<string>("betterAuth.baseUrl");
  env.CLIENT_URL = config.get<string>("client.url");
}

/**
 * Writes the effective `logging.*` config into `LOG_*` env vars, always
 * overwriting whatever `.env` set. Must run before `initLogging()` so the
 * DB-backed `logging.toFile` / `logging.filePath` / `logging.redact` values
 * apply. `LOG_*` are seed-from-env only — operators should clear
 * them from `.env` after migrating to Admin → Configuration.
 */
export function syncLoggingEnvFromConfig(
  config: AppConfigService = appConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.LOG_LEVEL = config.get<string>("logging.level");
  env.LOG_TO_FILE = config.get<boolean>("logging.toFile") ? "true" : "false";
  const filePath = config.get<string>("logging.filePath");
  if (filePath.trim()) {
    env.LOG_FILE_PATH = filePath;
  } else {
    delete env.LOG_FILE_PATH;
  }
  env.LOG_REDACT = config.get<boolean>("logging.redact") ? "true" : "false";
}
