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
  if (!env.BETTER_AUTH_URL) {
    env.BETTER_AUTH_URL = config.get<string>("betterAuth.baseUrl");
  }
  if (!env.CLIENT_URL) {
    env.CLIENT_URL = config.get<string>("client.url");
  }
}
