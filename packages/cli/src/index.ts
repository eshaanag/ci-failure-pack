import { Command } from "commander";

import { captureLocalEnvironment } from "./commands/captureLocal.js";
import { diffBundle } from "./commands/diff.js";
import { renderHistory } from "./commands/history.js";
import { inspectBundle } from "./commands/inspect.js";
import { openBundleReport } from "./commands/open.js";
import { replayFailure, type ReplayOptions } from "./commands/replay.js";
import { createLogger } from "./lib/logger.js";

const logger = createLogger();

interface ReplayCliOptions {
  dryRun?: boolean | undefined;
  install?: boolean | undefined;
  yes?: boolean | undefined;
}

/**
 * Converts Commander replay flags into replay execution options.
 *
 * @param options - Raw Commander options for the replay command.
 * @returns Replay options with install skipped only when explicitly requested.
 */
export function normalizeReplayOptions(options: ReplayCliOptions): ReplayOptions {
  return {
    dryRun: options.dryRun === true,
    noInstall: options.install === false,
    yes: options.yes === true,
  };
}

/**
 * Creates the root CI Failure Pack CLI program.
 *
 * @returns A configured Commander program.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("ci-failure-pack")
    .description("Inspect, compare, and replay failed CI runs locally.")
    .version("0.1.0");

  program
    .command("inspect")
    .description("Inspect a failure-pack.zip bundle.")
    .argument("<bundle>", "Path to failure-pack.zip")
    .action(async (bundle: string): Promise<void> => {
      process.stdout.write(`${await inspectBundle(bundle)}\n`);
    });

  program
    .command("diff")
    .description("Compare CI environment from a bundle with this machine.")
    .argument("<bundle>", "Path to failure-pack.zip")
    .action(async (bundle: string): Promise<void> => {
      process.stdout.write(`${await diffBundle(bundle)}\n`);
    });

  program
    .command("capture-local")
    .description("Capture this machine's environment for CI comparison.")
    .option("-o, --output <path>", "Path for the local snapshot.", ".ci-failure-pack-local.json")
    .option("-y, --yes", "Overwrite an existing snapshot without prompting.", false)
    .action(async (options: { output: string; yes: boolean }): Promise<void> => {
      const result = await captureLocalEnvironment({
        outputPath: options.output,
        overwrite: options.yes,
      });
      process.stdout.write(`${result.message}\n`);
    });

  program
    .command("replay")
    .description("Replay a failure bundle locally.")
    .argument("<bundle>", "Path to failure-pack.zip")
    .option("--dry-run", "Print replay steps without executing them.", false)
    .option("--no-install", "Skip dependency installation steps.")
    .option("-y, --yes", "Proceed through safety prompts.", false)
    .action(
      async (
        bundle: string,
        options: { dryRun: boolean; install: boolean; yes: boolean },
      ): Promise<void> => {
        process.stdout.write(`${await replayFailure(bundle, normalizeReplayOptions(options))}\n`);
      },
    );

  program
    .command("history")
    .description("Show failure history for a test.")
    .argument("<test-name>", "Test name or partial test name.")
    .option(
      "--history <path>",
      "Path to a failure history JSON file.",
      ".ci-failure-pack-history.json",
    )
    .action(async (testName: string, options: { history: string }): Promise<void> => {
      process.stdout.write(`${await renderHistory(testName, { historyPath: options.history })}\n`);
    });

  program
    .command("open")
    .description("Open the first HTML report captured in a failure bundle.")
    .argument("<bundle>", "Path to failure-pack.zip")
    .action(async (bundle: string): Promise<void> => {
      process.stdout.write(`${await openBundleReport(bundle)}\n`);
    });

  return program;
}

/**
 * Runs the CLI entrypoint with guarded error handling.
 *
 * @param argv - Process argument vector to parse.
 * @returns A promise that resolves after command execution.
 */
export async function run(argv: string[]): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown CLI error";
    logger.error("CLI command failed", {
      error: message,
      recovery: "Run ci-failure-pack --help and check the command arguments.",
    });
    process.exitCode = 1;
  }
}
