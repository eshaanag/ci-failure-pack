import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { bundleManifestSchema, type BundleManifest } from "@ci-failure-pack/shared";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFailurePack, type PackageBundleOptions } from "../src/bundle/packager.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ci-failure-pack-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function options(overrides: Partial<PackageBundleOptions> = {}): PackageBundleOptions {
  return {
    outputPath: join(directory, "failure-pack.zip"),
    cwd: directory,
    manifest: {
      schemaVersion: "1.0.0",
      bundleId: randomUUID(),
      capturedAt: "2026-06-08T00:00:00.000Z",
      toolVersion: "0.1.0",
      source: "local-fixture",
      repository: {
        owner: "owner",
        name: "repo",
        fullName: "owner/repo",
        defaultBranch: "main",
      },
      workflow: {
        runId: "1",
        runAttempt: 1,
        workflowName: "CI",
        jobName: "test",
        runnerOs: "Linux",
        eventName: "pull_request",
      },
    },
    metadata: {
      generatedBy: "ci-failure-pack",
      actionVersion: "0.1.0",
      nodeVersion: "20.19.0",
      platform: "linux",
    },
    environment: {
      capturedAt: "2026-06-08T00:00:00.000Z",
      safe: [],
      redacted: [],
      missing: [],
    },
    testOutput: {
      format: "junit",
      total: 1,
      passed: 0,
      skipped: 0,
      failed: [{ name: "fails" }],
      durationMs: 10,
      parserErrors: [],
    },
    gitContext: {
      sha: "abc123",
      branch: "feature",
      baseBranch: "main",
      isPullRequest: true,
      changedFiles: ["src/example.ts"],
      warnings: [],
    },
    failedCommand: {
      stepName: "Test",
      command: "pnpm test",
      exitCode: 1,
      logTail: "failure output",
      truncated: false,
    },
    ...overrides,
  };
}

function zipEntries(path: string): string[] {
  return new AdmZip(path).getEntries().map((entry) => entry.entryName);
}

function readManifest(path: string): BundleManifest {
  const decoded: unknown = JSON.parse(new AdmZip(path).readAsText("manifest.json"));
  return bundleManifestSchema.parse(decoded);
}

describe("createFailurePack", () => {
  it("creates a ZIP with all required files", async () => {
    const result = await createFailurePack(options());
    expect(zipEntries(result.outputPath)).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "metadata.json",
        "env.json",
        "test-output.json",
        "git-context.json",
        "failed-command.json",
        "log.txt",
      ]),
    );
  });

  it("writes a manifest that passes the shared schema", async () => {
    const result = await createFailurePack(options());
    const manifest = readManifest(result.outputPath);
    expect(manifest.bundleId).toBe(result.manifest.bundleId);
    expect(manifest.files).toHaveLength(6);
  });

  it("records non-critical capture errors while still creating a ZIP", async () => {
    const result = await createFailurePack(
      options({
        errors: [
          {
            module: "capture.tests",
            severity: "warning",
            message: "No test report found.",
            recovery: "Configure a test report glob.",
          },
        ],
      }),
    );
    expect(readManifest(result.outputPath).errors[0]?.module).toBe("capture.tests");
  });

  it("includes matching artifact globs and skips non-matches", async () => {
    await mkdir(join(directory, "test-results"), { recursive: true });
    await writeFile(join(directory, "test-results", "report.txt"), "report");
    await writeFile(join(directory, "not-included.txt"), "skip");
    const result = await createFailurePack(
      options({ artifactGlobs: ["test-results/**/*", "missing/**/*"] }),
    );
    const entries = zipEntries(result.outputPath);
    expect(entries).toContain("artifacts/test-results/report.txt");
    expect(entries).not.toContain("artifacts/not-included.txt");
  });

  it("keeps a large fixture bundle under the default 50 MB limit", async () => {
    await writeFile(join(directory, "large.bin"), Buffer.alloc(2 * 1024 * 1024, 1));
    const result = await createFailurePack(options({ artifactGlobs: ["large.bin"] }));
    const archiveStat = await stat(result.outputPath);
    expect(result.uncompressedSizeBytes).toBeGreaterThan(2 * 1024 * 1024);
    expect(archiveStat.size).toBeLessThan(50 * 1024 * 1024);
  });

  it("rejects an oversized bundle before writing it", async () => {
    await writeFile(join(directory, "large.bin"), Buffer.alloc(256, 1));
    const outputPath = join(directory, "too-large.zip");
    await expect(
      createFailurePack(options({ outputPath, artifactGlobs: ["large.bin"], maxBundleBytes: 100 })),
    ).rejects.toThrow("above the 100 byte limit");
    await expect(stat(outputPath)).rejects.toThrow();
  });
});
