import { actionInputsSchema } from "@ci-failure-pack/shared";

import { createLogger } from "./lib/logger.js";

const logger = createLogger();

function optionalText(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}

function optionalInteger(name: string): number | undefined {
  const value = optionalText(name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Runs the Phase 0 action entrypoint.
 *
 * @returns Nothing after startup validation completes.
 */
export function run(): void {
  try {
    const inputs = actionInputsSchema.parse({
      failedStepName: optionalText("CFP_FAILED_STEP_NAME"),
      failedCommand: optionalText("CFP_FAILED_COMMAND"),
      exitCode: optionalInteger("CFP_EXIT_CODE"),
      logTail: optionalText("CFP_LOG_TAIL"),
      logTailLines: optionalInteger("CFP_LOG_TAIL_LINES"),
      commentVerbosity: optionalText("CFP_COMMENT_VERBOSITY"),
      bundleName: optionalText("CFP_BUNDLE_NAME"),
      configPath: optionalText("CFP_CONFIG_PATH"),
    });

    logger.info("ci-failure-pack action initialized", {
      bundleName: inputs.bundleName,
      commentVerbosity: inputs.commentVerbosity,
      logTailLines: inputs.logTailLines,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown startup error";
    logger.error("Action startup validation failed", {
      error: message,
      recovery: "Check CI Failure Pack action inputs and rerun the failed workflow.",
    });
    process.exitCode = 1;
  }
}

run();
