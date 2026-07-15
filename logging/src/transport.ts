import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pino, { type Logger } from "pino";
import { getLoggingConfig, type LoggingConfig, type LoggingPackageOptions } from "./config.js";

function ensureLogDirectory(logFilePath: string): void {
  mkdirSync(dirname(logFilePath), { recursive: true });
}

export function createLoggerFromConfig(config: LoggingConfig): Logger {
  if (config.isTest) {
    return pino(config.loggerOptions);
  }

  const targets: pino.TransportTargetOptions[] = [];

  if (config.isDevelopment) {
    targets.push({
      target: "pino-pretty",
      level: config.level,
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    });
  } else {
    targets.push({
      target: "pino/file",
      level: config.level,
      options: { destination: 1 },
    });
  }

  if (config.logToFile) {
    ensureLogDirectory(config.logFilePath);
    targets.push({
      target: "pino/file",
      level: config.level,
      options: { destination: config.logFilePath, mkdir: true },
    });
  }

  if (targets.length === 1) {
    return pino(
      config.loggerOptions,
      pino.transport({ target: targets[0]!.target, options: targets[0]!.options }),
    );
  }

  return pino(config.loggerOptions, pino.transport({ targets }));
}

export function createLogger(packageOptions: LoggingPackageOptions): Logger {
  return createLoggerFromConfig(getLoggingConfig(packageOptions));
}
