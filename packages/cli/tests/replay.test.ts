import { SCHEMA_VERSION, type EnvironmentSnapshot } from "@ci-failure-pack/shared";
import { describe, expect, it } from "vitest";

import {
  replayFailure,
  type ReplayCommandResult,
  type ReplayCommandRunner,
} from "../src/commands/replay.js";
import type { ReadableFailurePack } from "../src/lib/bundleReader.js";

function snapshot(nodeVersion: string): EnvironmentSnapshot {
  return {
    capturedAt: "2026-06-08T00:00:00.000Z",
    safe: [{ name: "NODE_VERSION", value: nodeVersion, source: "detected" }],
    redacted: [],
    missing: [],
  };
}

function bundle(): ReadableFailurePack {
  return {
    manifest: {
      schemaVersion: SCHEMA_VERSION,
      bundleId: "550e8400-e29b-41d4-a716-446655440000",
      capturedAt: "2026-06-08T00:00:00.000Z",
      toolVersion: "0.1.0",
      source: "local-fixture",
      repository: { owner: "owner", name: "repo", fullName: "owner/repo", defaultBranch: "main" },
      workflow: {
        runId: "1",
        runAttempt: 1,
        workflowName: "CI",
        jobName: "test",
        runnerOs: "Linux",
        eventName: "pull_request",
      },
      files: [],
      errors: [],
    },
    metadata: {
      generatedBy: "ci-failure-pack",
      actionVersion: "0.1.0",
      nodeVersion: "20",
      platform: "linux",
    },
    environment: snapshot("20.11.1"),
    testOutput: {
      format: "junit",
      total: 1,
      passed: 0,
      skipped: 0,
      failed: [{ name: "fails", file: "tests/fails.test.ts" }],
      durationMs: 10,
      parserErrors: [],
    },
    gitContext: {
      sha: "abc123",
      branch: "feature",
      isPullRequest: true,
      changedFiles: [],
      warnings: [],
    },
    failedCommand: {
      command: "pnpm test",
      exitCode: 1,
      logTail: "failure",
      truncated: false,
    },
    causality: [],
    reproduction: {
      projectType: "node",
      summary: "Reproduce",
      commands: [
        {
          command: "pnpm install --frozen-lockfile",
          reason: "Install the exact dependency graph used by CI.",
          safeToRun: true,
        },
        { command: "pnpm test", reason: "Run the command that failed in CI.", safeToRun: true },
      ],
    },
    logTail: "failure",
  };
}

function ok(stdout = ""): ReplayCommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

describe("replayFailure", () => {
  it("prints a dry-run plan without executing commands", async () => {
    const commands: string[] = [];
    const output = await replayFailure("bundle.zip", {
      dryRun: true,
      readBundle: () => Promise.resolve(bundle()),
      commandRunner: {
        run(command: string): Promise<ReplayCommandResult> {
          commands.push(command);
          return Promise.resolve(ok());
        },
      },
    });

    expect(output).toContain("Replay dry run");
    expect(output).toContain("git checkout abc123");
    expect(output).toContain("pnpm test");
    expect(commands).toEqual([]);
  });

  it("stops for confirmation when the local environment differs", async () => {
    let question = "";

    await expect(
      replayFailure("bundle.zip", {
        readBundle: () => Promise.resolve(bundle()),
        localEnvironment: snapshot("22.1.0"),
        confirm: (value: string): Promise<boolean> => {
          question = value;
          return Promise.resolve(false);
        },
      }),
    ).rejects.toThrow("environment differences remain");
    expect(question).toContain("Proceed anyway");
  });

  it("returns a clear error when git is missing", async () => {
    const missingGitRunner: ReplayCommandRunner = {
      run(command: string): Promise<ReplayCommandResult> {
        if (command === "git --version") {
          return Promise.reject(new Error("spawn git ENOENT"));
        }
        return Promise.resolve(ok());
      },
    };

    await expect(
      replayFailure("bundle.zip", {
        readBundle: () => Promise.resolve(bundle()),
        localEnvironment: snapshot("20.11.1"),
        commandRunner: missingGitRunner,
      }),
    ).rejects.toThrow("Install Git");
  });

  it("skips dependency install steps with noInstall", async () => {
    const commands: string[] = [];
    const runner: ReplayCommandRunner = {
      run(command: string): Promise<ReplayCommandResult> {
        commands.push(command);
        if (command === "git status --porcelain") return Promise.resolve(ok(""));
        if (command === "pnpm test")
          return Promise.resolve({ stdout: "", stderr: "", exitCode: 1 });
        return Promise.resolve(ok());
      },
    };

    const output = await replayFailure("bundle.zip", {
      readBundle: () => Promise.resolve(bundle()),
      localEnvironment: snapshot("20.11.1"),
      commandRunner: runner,
      noInstall: true,
    });

    expect(commands).toContain("git checkout abc123");
    expect(commands).not.toContain("pnpm install --frozen-lockfile");
    expect(commands).toContain("pnpm test");
    expect(output).toContain("Failure reproduced");
  });
});
