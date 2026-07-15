import { resolve } from "node:path";
import pino, { type LoggerOptions } from "pino";

const PINO_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;

export type PinoLevel = (typeof PINO_LEVELS)[number];

export const LOG_LEVELS = PINO_LEVELS;

export interface LoggingPackageOptions {
  service: string;
  defaultLogFilePath: string;
}

function parseLogLevel(value: string | undefined, fallback: PinoLevel): PinoLevel {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if ((PINO_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as PinoLevel;
  }
  return fallback;
}

function resolveLogFilePath(defaultLogFilePath: string): string {
  const configured = process.env.LOG_FILE_PATH;
  if (!configured) {
    return resolve(defaultLogFilePath);
  }
  return resolve(configured);
}

export function isTestLogging(): boolean {
  return process.env.NODE_ENV === "test" || process.env.LOG_LEVEL === "silent";
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production" && !isTestLogging();
}

export interface LoggingConfig {
  level: PinoLevel;
  logFilePath: string;
  logToFile: boolean;
  redactEnabled: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  loggerOptions: LoggerOptions;
}

const REDACT_PATHS = [
  "req.headers.authorization",
  'req.headers["x-api-key"]',
  "req.headers.cookie",
  "req.body.password",
  "accessToken",
  "refreshToken",
  "*.accessToken",
  "*.refreshToken",
  "*.password",
  "*.clientSecret",
  "authorization",
] as const;

export function getLoggingConfig(packageOptions: LoggingPackageOptions): LoggingConfig {
  const isTest = isTestLogging();
  const isDev = isDevelopment();
  const level = parseLogLevel(process.env.LOG_LEVEL, isTest ? "silent" : isDev ? "debug" : "info");
  const logFilePath = resolveLogFilePath(packageOptions.defaultLogFilePath);
  const logToFile = process.env.LOG_TO_FILE !== "false";
  const redactEnabled = process.env.LOG_REDACT !== "false";

  const loggerOptions: LoggerOptions = {
    level,
    base: {
      service: packageOptions.service,
      env: process.env.NODE_ENV ?? "development",
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
  };

  if (redactEnabled) {
    loggerOptions.redact = {
      paths: [...REDACT_PATHS],
      censor: "[Redacted]",
    };
  }

  return {
    level,
    logFilePath,
    logToFile,
    redactEnabled,
    isDevelopment: isDev,
    isTest,
    loggerOptions,
  };
}
