import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inspectBundle } from "../src/commands/inspect.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ci-failure-pack-cli-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function addJson(zip: AdmZip, name: string, value: unknown): void {
  zip.addFile(name, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

function writeBundle(path: string, invalidManifest = false): void {
  const zip = new AdmZip();
  addJson(zip, "manifest.json", {
    schemaVersion: "1.0.0",
    bundleId: randomUUID(),
    capturedAt: "2026-06-08T00:00:00.000Z",
    toolVersion: "0.1.0",
    source: "local-fixture",
    repository: { owner: "owner", name: "repo", fullName: "owner/repo", defaultBranch: "main" },
    ...(invalidManifest
      ? {}
      : {
          workflow: {
            runId: "1",
            runAttempt: 1,
            workflowName: "CI",
            jobName: "test",
            runnerOs: "Linux",
            eventName: "pull_request",
          },
        }),
    files: [],
    errors: [],
  });
  addJson(zip, "metadata.json", {
    generatedBy: "ci-failure-pack",
    actionVersion: "0.1.0",
    nodeVersion: "20",
    platform: "linux",
  });
  addJson(zip, "env.json", {
    capturedAt: "2026-06-08T00:00:00.000Z",
    safe: [{ name: "NODE_ENV", value: "test", source: "process" }],
    redacted: [{ name: "GITHUB_TOKEN", marker: "[REDACTED:name]", reason: "name" }],
    missing: [],
  });
  addJson(zip, "test-output.json", {
    format: "junit",
    total: 1,
    passed: 0,
    skipped: 0,
    failed: [
      { name: "UserService creates users", file: "tests/user.test.ts", assertion: "expected 201" },
    ],
    durationMs: 10,
    parserErrors: [],
  });
  addJson(zip, "git-context.json", {
    sha: "abc123",
    branch: "feature",
    baseBranch: "main",
    isPullRequest: true,
    changedFiles: ["tests/user.test.ts"],
    warnings: [],
  });
  addJson(zip, "failed-command.json", {
    stepName: "Test",
    command: "pnpm test",
    exitCode: 1,
    logTail: "failure",
    truncated: false,
  });
  addJson(zip, "causality.json", [
    {
      signal: "runtime_version_mismatch",
      label: "Runtime version mismatch",
      weight: 85,
      percentage: 100,
      evidence: "Node mismatch",
    },
  ]);
  addJson(zip, "reproduction.json", {
    projectType: "node",
    summary: "Reproduce",
    commands: [{ command: "pnpm test", reason: "Run failed command.", safeToRun: true }],
  });
  zip.addFile("log.txt", Buffer.from("failure", "utf8"));
  zip.writeZip(path);
}

describe("inspectBundle", () => {
  it("renders a validated sample bundle", async () => {
    const bundlePath = join(directory, "failure-pack.zip");
    writeBundle(bundlePath);
    const output = await inspectBundle(bundlePath);
    expect(output).toContain("CI Failure Pack");
    expect(output).toContain("UserService creates users");
    expect(output).toContain("Runtime version mismatch");
    expect(output).toContain("pnpm test");
  });

  it("returns a helpful error for a missing bundle file", async () => {
    await expect(inspectBundle(join(directory, "missing.zip"))).rejects.toThrow(
      "Run the action first, then download the artifact",
    );
  });

  it("returns a clean error for a corrupt ZIP", async () => {
    const bundlePath = join(directory, "corrupt.zip");
    await writeFile(bundlePath, "not a zip");
    await expect(inspectBundle(bundlePath)).rejects.toThrow("the ZIP is corrupt");
  });

  it("shows the invalid field when schema validation fails", async () => {
    const bundlePath = join(directory, "invalid.zip");
    writeBundle(bundlePath, true);
    await expect(inspectBundle(bundlePath)).rejects.toThrow("workflow");
  });
});
