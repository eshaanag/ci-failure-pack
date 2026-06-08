import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FailureHistory } from "@ci-failure-pack/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderHistory } from "../src/commands/history.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ci-failure-pack-history-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function history(records: FailureHistory["records"]): FailureHistory {
  return {
    repository: "owner/repo",
    updatedAt: "2026-06-08T00:00:00.000Z",
    records,
  };
}

describe("renderHistory", () => {
  it("fuzzy matches a partial test name and renders its timeline", async () => {
    const output = await renderHistory("Button renders", {
      readHistoryFile: () =>
        Promise.resolve(
          JSON.stringify(
            history([
              {
                testName: "Button renders with defaults",
                classification: "flaky",
                failures: [
                  {
                    commitSha: "abcdef123456",
                    runId: "run-1",
                    failedAt: "2026-06-07T10:00:00.000Z",
                    relatedFilesChanged: false,
                  },
                ],
              },
            ]),
          ),
        ),
    });

    expect(output).toContain("Button renders with defaults");
    expect(output).toContain("Classification: flaky");
    expect(output).toContain("abcdef1");
  });

  it("returns helpful guidance when no history exists", async () => {
    const output = await renderHistory("Button renders", { cwd: directory });

    expect(output).toBe(
      "No failure history found. Run the action with flaky-detection: true to start collecting history.",
    );
  });

  it("shows all matches and asks the developer to narrow the query", async () => {
    const output = await renderHistory("Button", {
      readHistoryFile: () =>
        Promise.resolve(
          JSON.stringify(
            history([
              {
                testName: "Button renders with defaults",
                classification: "unknown",
                failures: [
                  {
                    commitSha: "1111111",
                    runId: "run-1",
                    failedAt: "2026-06-07T10:00:00.000Z",
                    relatedFilesChanged: false,
                  },
                ],
              },
              {
                testName: "Button handles disabled state",
                classification: "broken",
                failures: [
                  {
                    commitSha: "2222222",
                    runId: "run-2",
                    failedAt: "2026-06-08T10:00:00.000Z",
                    relatedFilesChanged: true,
                  },
                ],
              },
            ]),
          ),
        ),
    });

    expect(output).toContain('Multiple tests match "Button"');
    expect(output).toContain("Button renders with defaults");
    expect(output).toContain("Button handles disabled state");
    expect(output).toContain("Narrow the test name");
  });
});
