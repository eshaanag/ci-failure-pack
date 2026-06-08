import { describe, expect, it, vi } from "vitest";

import { formatFailureComment } from "../src/comment/formatter.js";
import { postOrUpdateComment, type GitHubApiClient } from "../src/comment/poster.js";
import { COMMENT_MARKER, type CommentContext } from "../src/comment/verbosity.js";

function context(): CommentContext {
  return {
    jobName: "test",
    testOutput: {
      format: "junit",
      total: 4,
      passed: 2,
      skipped: 0,
      failed: [
        {
          name: "UserService creates users",
          file: "tests/user.test.ts",
          assertion: "expected 201",
        },
        {
          name: "Billing retries declined cards",
          file: "tests/billing.test.ts",
          assertion: "expected retry",
        },
      ],
      durationMs: 100,
      parserErrors: [],
    },
    causality: [
      {
        signal: "runtime_version_mismatch",
        label: "Node version mismatch",
        weight: 85,
        percentage: 62,
        evidence: "CI uses Node 22; project pins Node 20",
      },
    ],
    reproductionCommand: "npx ci-failure-pack replay failure-pack.zip",
    environment: {
      capturedAt: "2026-06-08T00:00:00.000Z",
      safe: [{ name: "NODE_ENV", value: "test", source: "process" }],
      redacted: [{ name: "GITHUB_TOKEN", marker: "[REDACTED:name]", reason: "name" }],
      missing: [],
    },
    cacheState: {
      caches: [{ name: "pnpm", key: "pnpm-linux", hit: false, source: "actions-cache" }],
      lockfileChanged: true,
      packageChanges: [],
    },
    artifactUrl: "https://example.test/failure-pack.zip",
    logTail: "expected 201\nreceived 500",
  };
}

function clientWith(request: GitHubApiClient["request"]): {
  client: GitHubApiClient;
  request: ReturnType<typeof vi.fn<GitHubApiClient["request"]>>;
} {
  const mock = vi.fn<GitHubApiClient["request"]>(request);
  return { client: { request: mock }, request: mock };
}

describe("PR comment formatting", () => {
  it("renders a brief two-test failure comment", () => {
    const output = formatFailureComment(context(), "brief");
    expect(output).toContain("❌ test failed");
    expect(output).toContain("2 assertions failed");
    expect(output).toContain("Node version mismatch (62%)");
    expect(output.split("\n")).toHaveLength(5);
  });

  it("includes environment and artifact detail in standard mode", () => {
    const output = formatFailureComment(context(), "standard");
    expect(output).toContain("| NODE_ENV | test |");
    expect(output).toContain("Cache: pnpm");
    expect(output).toContain("failure-pack.zip");
  });

  it("includes collapsible failures and log tail in full mode", () => {
    const output = formatFailureComment(context(), "full");
    expect(output).toContain("<summary>Failed tests</summary>");
    expect(output).toContain("<summary>Log tail</summary>");
    expect(output).toContain("received 500");
  });
});

describe("postOrUpdateComment", () => {
  it("skips API calls when the run is not a pull request", async () => {
    const { client, request } = clientWith(() => Promise.resolve({ status: 200, data: [] }));
    const result = await postOrUpdateComment({
      owner: "owner",
      repository: "repo",
      token: "token",
      body: COMMENT_MARKER,
      client,
    });
    expect(result).toBe("skipped");
    expect(request).not.toHaveBeenCalled();
  });

  it("logs a clear non-fatal error when GitHub returns 403", async () => {
    const warn = vi.fn();
    const { client } = clientWith(() =>
      Promise.resolve({ status: 403, data: { message: "Forbidden" } }),
    );
    const result = await postOrUpdateComment({
      owner: "owner",
      repository: "repo",
      pullRequestNumber: 12,
      token: "token",
      body: COMMENT_MARKER,
      client,
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    });
    expect(result).toBe("failed");
    expect(warn).toHaveBeenCalledWith(
      "GitHub API could not list PR comments.",
      expect.objectContaining({ status: 403 }),
    );
  });

  it("updates an existing marker comment instead of duplicating it", async () => {
    const { client, request } = clientWith((method) => {
      if (method === "GET") {
        return Promise.resolve({ status: 200, data: [{ id: 99, body: `${COMMENT_MARKER}\nold` }] });
      }
      return Promise.resolve({ status: 200, data: {} });
    });
    const result = await postOrUpdateComment({
      owner: "owner",
      repository: "repo",
      pullRequestNumber: 12,
      token: "token",
      body: `${COMMENT_MARKER}\nnew`,
      client,
    });
    expect(result).toBe("updated");
    expect(request).toHaveBeenLastCalledWith(
      "PATCH",
      expect.stringContaining("/issues/comments/99"),
      "token",
      { body: `${COMMENT_MARKER}\nnew` },
    );
  });
});
