import type { LogLevel, Logger, LoggerFields } from "@ci-failure-pack/shared";

function severity(level: LogLevel): number {
  switch (level) {
    case "debug":
      return 10;
    case "info":
      return 20;
    case "warn":
      return 30;
    case "error":
      return 40;
    case "silent":
      return 100;
  }
}

function readLogLevel(): LogLevel {
  const raw = process.env["LOG_LEVEL"]?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error" || raw === "silent") {
    return raw;
  }
  return "info";
}

function shouldSilenceForTest(): boolean {
  return process.env["NODE_ENV"] === "test" || process.env["VITEST"] === "true";
}

function emit(level: Exclude<LogLevel, "silent">, message: string, fields?: LoggerFields): void {
  const configuredLevel = readLogLevel();
  if (shouldSilenceForTest() || severity(level) < severity(configuredLevel)) {
    return;
  }

  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
}

/**
 * Creates the structured logger used by the GitHub Action runtime.
 *
 * @returns Logger methods that respect LOG_LEVEL and test-mode silence.
 */
export function createLogger(): Logger {
  return {
    debug(message: string, fields?: LoggerFields): void {
      emit("debug", message, fields);
    },
    info(message: string, fields?: LoggerFields): void {
      emit("info", message, fields);
    },
    warn(message: string, fields?: LoggerFields): void {
      emit("warn", message, fields);
    },
    error(message: string, fields?: LoggerFields): void {
      emit("error", message, fields);
    },
  };
}
