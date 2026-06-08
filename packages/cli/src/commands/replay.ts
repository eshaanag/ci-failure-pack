import { exec } from "node:child_process";
import type { ExecException } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

import type { EnvironmentSnapshot, ReproductionStep } from "@ci-failure-pack/shared";
import chalk from "chalk";

import { diffEnvironmentSnapshots, renderEnvironmentDiff } from "./diff.js";
import { readFailurePack, type ReadableFailurePack } from "../lib/bundleReader.js";
import { detectLocalEnvironment } from "../lib/localEnv.js";
import type { LocalCommandRunner } from "../lib/localEnv.js";

const execAsync = promisify(exec);

export interface ReplayCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ReplayCommandRunner {
  run(command: string, options: ReplayRunOptions): Promise<ReplayCommandResult>;
}

export interface ReplayRunOptions {
  cwd: string;
  env?: Readonly<Record<string, string>>;
}

export interface ReplayOptions {
  cwd?: string;
  dryRun?: boolean;
  noInstall?: boolean;
  yes?: boolean;
  commandRunner?: ReplayCommandRunner;
  localRunner?: LocalCommandRunner;
  localEnvironment?: EnvironmentSnapshot;
  readBundle?: (bundlePath: string) => Promise<ReadableFailurePack>;
  confirm?: (question: string) => Promise<boolean>;
}

interface ReplayPlanStep {
  label: string;
  command: string;
  env?: Readonly<Record<string, string>>;
}

const defaultRunner: ReplayCommandRunner = {
  async run(command: string, options: ReplayRunOptions): Promise<ReplayCommandResult> {
    try {
      const result = await execAsync(command, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        maxBuffer: 20 * 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as ExecException & { stdout?: string; stderr?: string };
      if (typeof execError.code === "number") {
        return {
          stdout: execError.stdout ?? "",
          stderr: execError.stderr ?? "",
          exitCode: execError.code,
        };
      }
      const message = error instanceof Error ? error.message : "Unknown command execution error";
      throw new Error(`Could not run ${command}: ${message}`, { cause: error });
    }
  },
};

function environmentNames(snapshot: EnvironmentSnapshot): string[] {
  return [
    ...new Set([
      ...snapshot.safe.map(({ name }) => name),
      ...snapshot.redacted.map(({ name }) => name),
    ]),
  ];
}

function nonSecretEnv(snapshot: EnvironmentSnapshot): Record<string, string> {
  return Object.fromEntries(snapshot.safe.map(({ name, value }) => [name, value]));
}

function isInstallStep(step: ReproductionStep): boolean {
  const command = step.command.toLowerCase();
  const reason = step.reason.toLowerCase();
  return (
    reason.includes("install") ||
    command.includes(" install ") ||
    command.endsWith(" install") ||
    command.includes(" npm ci") ||
    command === "npm ci" ||
    command.includes("mod download")
  );
}

function buildReplayPlan(bundle: ReadableFailurePack, options: ReplayOptions): ReplayPlanStep[] {
  const steps: ReplayPlanStep[] = [];
  if (bundle.gitContext.sha !== undefined) {
    steps.push({ label: "checkout", command: `git checkout ${bundle.gitContext.sha}` });
  }
  const failedCommand =
    bundle.failedCommand.command ?? bundle.reproduction?.commands.at(-1)?.command;
  for (const step of bundle.reproduction?.commands ?? []) {
    if (!step.safeToRun || step.command === failedCommand) {
      continue;
    }
    if (options.noInstall === true && isInstallStep(step)) {
      continue;
    }
    steps.push({ label: isInstallStep(step) ? "install" : "setup", command: step.command });
  }
  if (failedCommand !== undefined) {
    steps.push({
      label: "failed command",
      command: failedCommand,
      env: nonSecretEnv(bundle.environment),
    });
  }
  return steps;
}

function renderDryRun(steps: readonly ReplayPlanStep[]): string {
  const lines = [`${chalk.cyan("▶")} Replay dry run`];
  for (const step of steps) {
    lines.push(`${chalk.cyan("→")} ${step.command}  ${chalk.gray(`(${step.label})`)}`);
  }
  return lines.join("\n");
}

async function ensureGitAvailable(runner: ReplayCommandRunner, cwd: string): Promise<void> {
  try {
    const result = await runner.run("git --version", { cwd });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || "git exited with a nonzero status");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown git error";
    throw new Error(
      `Could not run git — git is not available. Install Git and rerun ci-failure-pack replay. Details: ${message}`,
      { cause: error },
    );
  }
}

async function ensureCleanTree(
  runner: ReplayCommandRunner,
  cwd: string,
  confirm: (question: string) => Promise<boolean>,
  autoProceed: boolean,
): Promise<void> {
  const result = await runner.run("git status --porcelain", { cwd });
  if (result.exitCode !== 0) {
    throw new Error(
      `Could not check the git working tree before replay. Fix git status, then rerun replay.`,
    );
  }
  if (result.stdout.trim() === "") {
    return;
  }
  if (autoProceed) {
    return;
  }
  const proceed = await confirm(
    "Your working tree has local changes. Continue with checkout? [y/N]",
  );
  if (!proceed) {
    throw new Error(
      "Replay cancelled because the working tree is dirty. Commit or stash changes first.",
    );
  }
}

async function defaultConfirm(question: string): Promise<boolean> {
  const readline = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await readline.question(`${question} `);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    readline.close();
  }
}

/**
 * Replays a CI failure bundle locally with guarded checkout, install, and failed-command steps.
 *
 * @param bundlePath - Path to failure-pack.zip.
 * @param options - Replay execution options and injectable test boundaries.
 * @returns Human-readable replay result or dry-run plan.
 */
export async function replayFailure(
  bundlePath: string,
  options: ReplayOptions = {},
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const bundle = await (options.readBundle ?? readFailurePack)(bundlePath);
  const plan = buildReplayPlan(bundle, options);
  if (options.dryRun === true) {
    return renderDryRun(plan);
  }

  const local =
    options.localEnvironment ??
    (await detectLocalEnvironment(
      options.localRunner === undefined
        ? { requestedEnvNames: environmentNames(bundle.environment) }
        : { requestedEnvNames: environmentNames(bundle.environment), runner: options.localRunner },
    ));
  const mismatches = diffEnvironmentSnapshots(bundle.environment, local).filter(
    (row) => row.status !== "match",
  );
  if (mismatches.length > 0 && options.yes !== true) {
    const proceed = await (options.confirm ?? defaultConfirm)(
      "Environment differs from CI. Proceed anyway? [y/N]",
    );
    if (!proceed) {
      throw new Error(
        `Replay cancelled because environment differences remain.\n${renderEnvironmentDiff(mismatches)}`,
      );
    }
  }

  const runner = options.commandRunner ?? defaultRunner;
  await ensureGitAvailable(runner, cwd);
  await ensureCleanTree(runner, cwd, options.confirm ?? defaultConfirm, options.yes === true);
  for (const step of plan) {
    const runOptions: ReplayRunOptions = step.env === undefined ? { cwd } : { cwd, env: step.env };
    const result = await runner.run(step.command, runOptions);
    if (step.label === "failed command") {
      if (result.exitCode !== 0) {
        return `${chalk.green("✓")} Failure reproduced\n${chalk.gray(step.command)} exited ${result.exitCode}`;
      }
      return `${chalk.yellow("⚠")} Did not reproduce — CI failure command exited 0 locally. Run ci-failure-pack diff to check remaining differences.`;
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `Replay setup failed while running "${step.command}" (exit ${result.exitCode}). Fix that command locally, then rerun replay.`,
      );
    }
  }
  return `${chalk.yellow("⚠")} Did not reproduce — no failed command was available in the bundle.`;
}
