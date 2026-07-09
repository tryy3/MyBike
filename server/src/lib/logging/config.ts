import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pino, { type LoggerOptions } from "pino";

const PINO_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;

export type PinoLevel = (typeof PINO_LEVELS)[number];

export const LOG_LEVELS = PINO_LEVELS;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function parseLogLevel(value: string | undefined, fallback: PinoLevel): PinoLevel {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if ((PINO_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as PinoLevel;
  }
  return fallback;
}

function resolveLogFilePath(): string {
  const configured = process.env.LOG_FILE_PATH;
  if (!configured) {
    return resolve(repoRoot, "server/data/mybike.log");
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
  isDevelopment: boolean;
  isTest: boolean;
  loggerOptions: LoggerOptions;
}

export function getLoggingConfig(): LoggingConfig {
  const isTest = isTestLogging();
  const isDev = isDevelopment();
  const level = parseLogLevel(process.env.LOG_LEVEL, isTest ? "silent" : isDev ? "debug" : "info");
  const logFilePath = resolveLogFilePath();
  const logToFile = process.env.LOG_TO_FILE !== "false";

  const loggerOptions: LoggerOptions = {
    level,
    base: {
      service: "mybike-server",
      env: process.env.NODE_ENV ?? "development",
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "accessToken",
        "refreshToken",
        "*.accessToken",
        "*.refreshToken",
        "*.password",
        "*.clientSecret",
        "authorization",
      ],
      censor: "[Redacted]",
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
  };

  return {
    level,
    logFilePath,
    logToFile,
    isDevelopment: isDev,
    isTest,
    loggerOptions,
  };
}
