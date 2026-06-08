import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadFailurePackConfig } from "../src/config.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ci-failure-pack-config-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function writeConfig(contents: string): Promise<void> {
  await writeFile(join(directory, ".ci-failure-pack.yml"), contents, "utf8");
}

describe("loadFailurePackConfig", () => {
  it("loads a valid snake_case config file", async () => {
    await writeConfig(`
comment_verbosity: full
bundle_name: custom-pack.zip
log_tail_lines: 500
flaky_detection: false
auto_open_flaky_issue: true
sensitive_env_vars:
  - STRIPE_SECRET_KEY
artifact_globs:
  - "test-results/**/*"
causality_weights:
  lockfile_changed: 99
`);

    const result = await loadFailurePackConfig({ cwd: directory });

    expect(result.config.commentVerbosity).toBe("full");
    expect(result.config.bundleName).toBe("custom-pack.zip");
    expect(result.config.logTailLines).toBe(500);
    expect(result.config.flakyDetection).toBe(false);
    expect(result.config.autoOpenFlakyIssue).toBe(true);
    expect(result.config.sensitiveEnvVars).toEqual(["STRIPE_SECRET_KEY"]);
    expect(result.config.artifactGlobs).toEqual(["test-results/**/*"]);
    expect(result.config.causalityWeights.lockfileChanged).toBe(99);
    expect(result.warnings).toEqual([]);
  });

  it("falls back to the default when comment_verbosity is invalid", async () => {
    await writeConfig("comment_verbosity: noisy\n");

    const result = await loadFailurePackConfig({ cwd: directory });

    expect(result.config.commentVerbosity).toBe("brief");
    expect(result.warnings).toContain("Invalid comment_verbosity; using default brief.");
  });

  it("warns about unknown fields while loading the rest of the config", async () => {
    await writeConfig(`
comment_verbosity: standard
future_option: true
`);

    const result = await loadFailurePackConfig({ cwd: directory });

    expect(result.config.commentVerbosity).toBe("standard");
    expect(result.warnings).toContain("Unknown configuration field ignored: future_option.");
  });

  it("returns defaults when no config file exists", async () => {
    const result = await loadFailurePackConfig({ cwd: directory });

    expect(result.config.commentVerbosity).toBe("brief");
    expect(result.config.bundleName).toBe("failure-pack.zip");
    expect(result.warnings).toEqual([]);
  });
});
