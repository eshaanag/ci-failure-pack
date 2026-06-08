import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SCHEMA_VERSION,
  generateReproductionCommand,
  type BundleManifest,
  type BundleMetadata,
  type EnvironmentSnapshot,
  type FailedCommand,
  type GitContext,
  type ParsedTestOutput,
} from "../../packages/shared/src/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFailurePack } from "../../packages/action/src/bundle/packager.js";
import {
  postOrUpdateComment,
  type GitHubApiClient,
} from "../../packages/action/src/comment/poster.js";
import { inspectBundle } from "../../packages/cli/src/commands/inspect.js";
import { readFailurePack } from "../../packages/cli/src/lib/bundleReader.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ci-failure-pack-e2e-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function manifest(): Omit<BundleManifest, "files" | "errors"> {
  return {
    schemaVersion: SCHEMA_VERSION,
    bundleId: randomUUID(),
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
  };
}

const metadata: BundleMetadata = {
  generatedBy: "ci-failure-pack",
  actionVersion: "0.1.0",
  nodeVersion: "20.11.1",
  platform: "linux",
};

const environment: EnvironmentSnapshot = {
  capturedAt: "2026-06-08T00:00:00.000Z",
  safe: [{ name: "NODE_ENV", value: "test", source: "process" }],
  redacted: [],
  missing: [],
};

const gitContext: GitContext = {
  sha: "abc123",
  branch: "feature",
  isPullRequest: true,
  changedFiles: ["tests/user.test.ts"],
  warnings: [],
};

const failedCommand: FailedCommand = {
  stepName: "Test",
  command: "pnpm test",
  exitCode: 1,
  logTail: "expected 201 received 500",
  truncated: false,
};

function testOutput(failed: ParsedTestOutput["failed"]): ParsedTestOutput {
  return {
    format: "junit",
    total: failed.length,
    passed: 0,
    skipped: 0,
    failed,
    durationMs: 10,
    parserErrors: [],
  };
}

describe("full local flow", () => {
  it("packages a Node failure bundle and inspects it through the CLI", async () => {
    await writeFile(join(directory, "package.json"), '{"scripts":{"test":"vitest"}}\n');
    await writeFile(join(directory, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const outputPath = join(directory, "failure-pack.zip");

    await createFailurePack({
      cwd: directory,
      outputPath,
      manifest: manifest(),
      metadata,
      environment,
      testOutput: testOutput([
        {
          name: "UserService creates users",
          file: "tests/user.test.ts",
          assertion: "expected 201",
        },
      ]),
      gitContext,
      failedCommand,
    });

    const output = await inspectBundle(outputPath);

    expect(output).toContain("CI Failure Pack");
    expect(output).toContain("UserService creates users");
    expect(output).toContain("pnpm test");
  });

  it("generates Python reproduction commands from a fixture project", async () => {
    await writeFile(join(directory, "pyproject.toml"), "[project]\nname='fixture'\n");
    await writeFile(join(directory, ".python-version"), "3.12.1\n");

    const reproduction = await generateReproductionCommand({
      cwd: directory,
      failedCommand: { ...failedCommand, command: "pytest tests/test_user.py" },
      environment,
    });

    expect(reproduction.projectType).toBe("python");
    expect(reproduction.commands.map(({ command }) => command)).toContain("pyenv local 3.12.1");
    expect(reproduction.commands.map(({ command }) => command)).toContain(
      'pip install -e ".[dev]"',
    );
    expect(reproduction.commands.map(({ command }) => command)).toContain(
      "pytest tests/test_user.py",
    );
  });

  it("creates a valid bundle when no structured test report was found", async () => {
    const outputPath = join(directory, "empty-failure-pack.zip");

    await createFailurePack({
      cwd: directory,
      outputPath,
      manifest: manifest(),
      metadata,
      environment,
      testOutput: testOutput([]),
      gitContext,
      failedCommand,
    });

    const bundle = await readFailurePack(outputPath);

    expect(bundle.testOutput.failed).toEqual([]);
    expect(bundle.manifest.files.map(({ path }) => path)).toContain("test-output.json");
  });

  it("keeps the action non-fatal when PR comment posting fails", async () => {
    const warn = vi.fn();
    const client: GitHubApiClient = {
      request: () => Promise.resolve({ status: 500, data: { message: "server error" } }),
    };

    await expect(
      postOrUpdateComment({
        owner: "owner",
        repository: "repo",
        pullRequestNumber: 12,
        token: "token",
        body: "<!-- ci-failure-pack -->\nfailed",
        client,
        logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
      }),
    ).resolves.toBe("failed");
    expect(warn).toHaveBeenCalledWith(
      "GitHub API could not list PR comments.",
      expect.objectContaining({ status: 500 }),
    );
  });
});
