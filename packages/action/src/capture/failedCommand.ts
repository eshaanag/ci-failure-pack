import { readFile } from "node:fs/promises";

import {
  actionInputsSchema,
  failedCommandSchema,
  type FailedCommand,
  type Logger,
} from "@ci-failure-pack/shared";

import { createLogger } from "../lib/logger.js";

export interface TextFileReader {
  read(path: string): Promise<string>;
}

export interface FailedCommandCaptureOptions {
  stepName?: string;
  command?: string;
  exitCode?: number;
  logTail?: string;
  logTailLines?: number;
  env?: Readonly<Record<string, string | undefined>>;
  reader?: TextFileReader;
  logger?: Logger;
}

const defaultReader: TextFileReader = {
  async read(path: string): Promise<string> {
    try {
      return await readFile(path, "utf8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown file read error";
      throw new Error(`Could not read fallback log file ${path}: ${message}`, { cause: error });
    }
  },
};

function tail(value: string, maximumLines: number): { logTail: string; truncated: boolean } {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const truncated = lines.length > maximumLines;
  return { logTail: lines.slice(-maximumLines).join("\n"), truncated };
}

/**
 * Captures failed step metadata and a bounded log tail with non-fatal file fallbacks.
 *
 * @param options - Explicit action inputs, fallback environment paths, and injected dependencies.
 * @returns A schema-validated failed command record.
 */
export async function captureFailedCommand(
  options: FailedCommandCaptureOptions = {},
): Promise<FailedCommand> {
  const inputs = actionInputsSchema.parse({
    failedStepName: options.stepName,
    failedCommand: options.command,
    exitCode: options.exitCode,
    logTail: options.logTail,
    logTailLines: options.logTailLines,
  });
  const env = options.env ?? process.env;
  const reader = options.reader ?? defaultReader;
  const logger = options.logger ?? createLogger();
  let log = inputs.logTail ?? "";

  if (log === "") {
    const paths = [env["GITHUB_STEP_SUMMARY"], env["CFP_RAW_LOG_PATH"]].filter(
      (path, index, all): path is string =>
        path !== undefined && path.trim() !== "" && all.indexOf(path) === index,
    );
    for (const path of paths) {
      try {
        log = await reader.read(path);
        break;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown fallback log read error";
        logger.warn("Failed command log fallback could not be read", {
          path,
          error: message,
          recovery: "Pass the log-tail action input to include failed step output.",
        });
      }
    }
  }

  const bounded = tail(log, inputs.logTailLines);
  return failedCommandSchema.parse({
    ...(inputs.failedStepName === undefined ? {} : { stepName: inputs.failedStepName }),
    ...(inputs.failedCommand === undefined ? {} : { command: inputs.failedCommand }),
    ...(inputs.exitCode === undefined ? {} : { exitCode: inputs.exitCode }),
    ...bounded,
  });
}
