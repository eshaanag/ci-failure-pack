import { describe, expect, it, vi } from "vitest";

import type { GitCommandRunner } from "../src/capture/gitContext.js";
import { captureGitContext } from "../src/capture/gitContext.js";

function runnerFrom(outputs: Readonly<Record<string, string>>): GitCommandRunner {
  return {
    run(args: readonly string[]): Promise<string> {
      const key = args.join(" ");
      const output = outputs[key];
      if (output === undefined) {
        return Promise.reject(new Error(`Unexpected git command: ${key}`));
      }
      return Promise.resolve(output);
    },
  };
}

describe("captureGitContext", () => {
  it("normalizes a GitHub branch ref", async () => {
    const result = await captureGitContext({
      env: {
        GITHUB_SHA: "abc123",
        GITHUB_REF: "refs/heads/feature/branch",
        GITHUB_EVENT_NAME: "push",
      },
      runner: runnerFrom({
        "rev-parse --is-shallow-repository": "false",
        "log -1 --pretty=%B": "feat: example",
      }),
    });

    expect(result).toMatchObject({ sha: "abc123", branch: "feature/branch", isPullRequest: false });
  });

  it("returns partial context and warns when git is unavailable", async () => {
    const warn = vi.fn();
    const result = await captureGitContext({
      env: { GITHUB_SHA: "abc123", GITHUB_REF: "refs/heads/main" },
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
      runner: { run: vi.fn().mockRejectedValue(new Error("spawn git ENOENT")) },
    });

    expect(result).toMatchObject({ sha: "abc123", branch: "main", changedFiles: [] });
    expect(result.warnings[0]).toContain("Git is unavailable");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("captures changed files for a pull request", async () => {
    const result = await captureGitContext({
      env: {
        GITHUB_SHA: "abc123",
        GITHUB_HEAD_REF: "feature/users",
        GITHUB_BASE_REF: "main",
        GITHUB_EVENT_NAME: "pull_request",
      },
      runner: runnerFrom({
        "rev-parse --is-shallow-repository": "false",
        "log -1 --pretty=%B": "feat: users",
        "diff --name-only origin/main...HEAD": "src/user.ts\ntests/user.test.ts\n",
      }),
    });

    expect(result.changedFiles).toEqual(["src/user.ts", "tests/user.test.ts"]);
    expect(result.isPullRequest).toBe(true);
  });

  it("notes a detached shallow checkout without crashing", async () => {
    const result = await captureGitContext({
      env: {},
      runner: runnerFrom({
        "rev-parse --is-shallow-repository": "true",
        "rev-parse HEAD": "abc123",
        "rev-parse --abbrev-ref HEAD": "HEAD",
        "log -1 --pretty=%B": "detached commit",
      }),
    });

    expect(result.sha).toBe("abc123");
    expect(result.branch).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("shallow");
    expect(result.warnings.join(" ")).toContain("detached");
  });
});
