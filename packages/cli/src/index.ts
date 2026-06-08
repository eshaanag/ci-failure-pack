#!/usr/bin/env node
import { Command } from "commander";

import { inspectBundle } from "./commands/inspect.js";
import { createLogger } from "./lib/logger.js";

const logger = createLogger();

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

void run(process.argv);
