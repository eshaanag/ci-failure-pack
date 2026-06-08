import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import chalk from "chalk";

import {
  detectLocalEnvironment,
  type LocalCommandRunner,
  type LocalEnvironmentOptions,
} from "../lib/localEnv.js";

export interface CaptureLocalOptions {
  outputPath?: string;
  cwd?: string;
  overwrite?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  runner?: LocalCommandRunner;
  capturedAt?: string;
  fileExists?: (path: string) => Promise<boolean>;
  writeSnapshot?: (path: string, contents: string) => Promise<void>;
  confirmOverwrite?: (path: string) => Promise<boolean>;
}

export interface CaptureLocalResult {
  outputPath: string;
  message: string;
}

async function defaultFileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function defaultWriteSnapshot(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, "utf8");
}

async function defaultConfirmOverwrite(path: string): Promise<boolean> {
  const readline = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await readline.question(`${path} already exists. Overwrite? [y/N] `);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    readline.close();
  }
}

/**
 * Captures a local environment snapshot and writes it to disk.
 *
 * @param options - Output path, overwrite behavior, and injectable test boundaries.
 * @returns The saved path and terminal-ready success message.
 */
export async function captureLocalEnvironment(
  options: CaptureLocalOptions = {},
): Promise<CaptureLocalResult> {
  const outputPath = resolve(
    options.cwd ?? process.cwd(),
    options.outputPath ?? ".ci-failure-pack-local.json",
  );
  const exists = await (options.fileExists ?? defaultFileExists)(outputPath);
  if (exists && options.overwrite !== true) {
    const confirmed = await (options.confirmOverwrite ?? defaultConfirmOverwrite)(outputPath);
    if (!confirmed) {
      throw new Error(
        `Refused to overwrite ${outputPath}. Pass --yes to overwrite it or choose a different --output path.`,
      );
    }
  }

  const detectionOptions: LocalEnvironmentOptions = {};
  if (options.env !== undefined) {
    detectionOptions.env = options.env;
  }
  if (options.runner !== undefined) {
    detectionOptions.runner = options.runner;
  }
  if (options.capturedAt !== undefined) {
    detectionOptions.capturedAt = options.capturedAt;
  }
  const snapshot = await detectLocalEnvironment(detectionOptions);
  const contents = `${JSON.stringify(snapshot, null, 2)}\n`;
  try {
    await (options.writeSnapshot ?? defaultWriteSnapshot)(outputPath, contents);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown filesystem error";
    throw new Error(
      `Could not write local environment snapshot to ${outputPath}: ${message}. Choose a writable --output path and try again.`,
      { cause: error },
    );
  }

  return {
    outputPath,
    message: `${chalk.green("✓")} Local environment captured\n${chalk.cyan("→")} ${outputPath}`,
  };
}
