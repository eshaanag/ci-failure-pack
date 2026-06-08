import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { gitContextSchema, type GitContext, type Logger } from "@ci-failure-pack/shared";

import { createLogger } from "../lib/logger.js";

const execFileAsync = promisify(execFile);

export interface GitCommandRunner {
  run(args: readonly string[], cwd: string): Promise<string>;
}

export interface GitContextOptions {
  env?: Readonly<Record<string, string | undefined>>;
  cwd?: string;
  defaultBranch?: string;
  runner?: GitCommandRunner;
  logger?: Logger;
}

const defaultRunner: GitCommandRunner = {
  async run(args: readonly string[], cwd: string): Promise<string> {
    try {
      const result = await execFileAsync("git", [...args], { cwd, encoding: "utf8" });
      return result.stdout.trim();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown git command error";
      throw new Error(`git ${args.join(" ")} failed: ${message}`, { cause: error });
    }
  },
};

function normalizedRef(ref: string | undefined): string | undefined {
  if (ref === undefined || ref.trim() === "") {
    return undefined;
  }
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function warningMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown git command error";
}

/**
 * Captures commit, branch, event, and changed-file context without failing when git is unavailable.
 *
 * @param options - Optional environment, working directory, logger, and command runner.
 * @returns A schema-validated partial or complete Git context.
 */
export async function captureGitContext(options: GitContextOptions = {}): Promise<GitContext> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? defaultRunner;
  const logger = options.logger ?? createLogger();
  const warnings: string[] = [];
  const isPullRequest =
    env["GITHUB_EVENT_NAME"] === "pull_request" ||
    env["GITHUB_EVENT_NAME"] === "pull_request_target" ||
    env["GITHUB_HEAD_REF"] !== undefined;
  const baseBranch = env["GITHUB_BASE_REF"] ?? options.defaultBranch ?? "main";
  let sha = env["GITHUB_SHA"];
  let branch = normalizedRef(env["GITHUB_HEAD_REF"] ?? env["GITHUB_REF"]);

  try {
    const shallow = await runner.run(["rev-parse", "--is-shallow-repository"], cwd);
    if (shallow === "true") {
      warnings.push("Git checkout is shallow; changed-file detection may be incomplete.");
    }
  } catch (error: unknown) {
    const message = `Git is unavailable; returning GitHub environment context only. ${warningMessage(error)}`;
    warnings.push(message);
    logger.warn(message, {
      recovery: "Install git or ensure actions/checkout runs before CI Failure Pack.",
    });
    return gitContextSchema.parse({
      ...(sha === undefined ? {} : { sha }),
      ...(branch === undefined ? {} : { branch }),
      baseBranch,
      isPullRequest,
      changedFiles: [],
      warnings,
    });
  }

  if (sha === undefined) {
    try {
      sha = await runner.run(["rev-parse", "HEAD"], cwd);
    } catch (error: unknown) {
      warnings.push(`Could not determine Git SHA. ${warningMessage(error)}`);
    }
  }

  if (branch === undefined) {
    try {
      const detectedBranch = await runner.run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      if (detectedBranch === "HEAD") {
        warnings.push("Git checkout is detached; branch name is unavailable.");
      } else {
        branch = detectedBranch;
      }
    } catch (error: unknown) {
      warnings.push(`Could not determine Git branch. ${warningMessage(error)}`);
    }
  }

  let commitMessage: string | undefined;
  try {
    commitMessage = await runner.run(["log", "-1", "--pretty=%B"], cwd);
  } catch (error: unknown) {
    warnings.push(`Could not read commit message. ${warningMessage(error)}`);
  }

  let changedFiles: string[] = [];
  if (isPullRequest) {
    try {
      changedFiles = splitLines(
        await runner.run(["diff", "--name-only", `origin/${baseBranch}...HEAD`], cwd),
      );
    } catch (error: unknown) {
      warnings.push(`Could not determine changed files. ${warningMessage(error)}`);
    }
  }

  return gitContextSchema.parse({
    ...(sha === undefined ? {} : { sha }),
    ...(branch === undefined ? {} : { branch }),
    baseBranch,
    ...(commitMessage === undefined ? {} : { commitMessage }),
    isPullRequest,
    changedFiles,
    warnings,
  });
}
