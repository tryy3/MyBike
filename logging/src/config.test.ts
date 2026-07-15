import { afterEach, describe, expect, it } from "vite-plus/test";
import { getLoggingConfig } from "./config.js";

const packageOptions = {
  service: "test-service",
  defaultLogFilePath: "logging/data/test.log",
};

describe("getLoggingConfig redaction", () => {
  const originalLogRedact = process.env.LOG_REDACT;

  afterEach(() => {
    if (originalLogRedact === undefined) {
      delete process.env.LOG_REDACT;
    } else {
      process.env.LOG_REDACT = originalLogRedact;
    }
  });

  it("includes redact paths by default", () => {
    delete process.env.LOG_REDACT;

    const config = getLoggingConfig(packageOptions);
    const redact = config.loggerOptions.redact as { paths: string[]; censor: string } | undefined;

    expect(config.redactEnabled).toBe(true);
    expect(redact).toBeDefined();
    expect(redact?.censor).toBe("[Redacted]");
    expect(redact?.paths).toEqual(
      expect.arrayContaining(["req.headers.authorization", "authorization"]),
    );
  });

  it("omits redact when LOG_REDACT=false", () => {
    process.env.LOG_REDACT = "false";

    const config = getLoggingConfig(packageOptions);

    expect(config.redactEnabled).toBe(false);
    expect(config.loggerOptions.redact).toBeUndefined();
  });
});
