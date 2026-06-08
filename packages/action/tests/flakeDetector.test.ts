import type { FailureHistory, GitContext, ParsedTestOutput } from "@ci-failure-pack/shared";
import { describe, expect, it } from "vitest";

import { classifyFlakyTests } from "../src/analyze/flakeDetector.js";

const gitContext: GitContext = {
  sha: "current",
  branch: "feature",
  isPullRequest: true,
  changedFiles: ["src/button.ts"],
  warnings: [],
};

function testOutput(name: string): ParsedTestOutput {
  return {
    format: "junit",
    total: 1,
    passed: 0,
    skipped: 0,
    failed: [{ name, file: "tests/button.test.ts" }],
    durationMs: 10,
    parserErrors: [],
  };
}

function history(failures: FailureHistory["records"][number]["failures"]): FailureHistory {
  return {
    repository: "owner/repo",
    updatedAt: "2026-06-08T00:00:00.000Z",
    records: [
      {
        testName: "Button renders",
        classification: "unknown",
        failures,
      },
    ],
  };
}

describe("classifyFlakyTests", () => {
  it("classifies 3 failures across commits with no related changes as flaky", () => {
    const [classification] = classifyFlakyTests({
      testOutput: testOutput("Button renders"),
      history: history([
        {
          commitSha: "a111111",
          runId: "run-1",
          failedAt: "2026-06-06T00:00:00.000Z",
          relatedFilesChanged: false,
        },
        {
          commitSha: "b222222",
          runId: "run-2",
          failedAt: "2026-06-07T00:00:00.000Z",
          relatedFilesChanged: false,
        },
        {
          commitSha: "c333333",
          runId: "run-3",
          failedAt: "2026-06-08T00:00:00.000Z",
          relatedFilesChanged: false,
        },
      ]),
      gitContext,
      relatedFilesChanged: false,
    });

    expect(classification?.classification).toBe("flaky");
    expect(classification?.reason).toContain("without related changes");
  });

  it("classifies a first failure after related file changes as broken", () => {
    const [classification] = classifyFlakyTests({
      testOutput: testOutput("New failure"),
      history: { repository: "owner/repo", updatedAt: "2026-06-08T00:00:00.000Z", records: [] },
      gitContext,
      relatedFilesChanged: true,
    });

    expect(classification?.classification).toBe("broken");
    expect(classification?.reason).toContain("no prior failures");
  });

  it("classifies 2 failures as unknown because history is insufficient", () => {
    const [classification] = classifyFlakyTests({
      testOutput: testOutput("Button renders"),
      history: history([
        {
          commitSha: "a111111",
          runId: "run-1",
          failedAt: "2026-06-07T00:00:00.000Z",
          relatedFilesChanged: false,
        },
        {
          commitSha: "b222222",
          runId: "run-2",
          failedAt: "2026-06-08T00:00:00.000Z",
          relatedFilesChanged: false,
        },
      ]),
      gitContext,
      relatedFilesChanged: false,
    });

    expect(classification?.classification).toBe("unknown");
    expect(classification?.reason).toContain("insufficient failure history");
  });
});
