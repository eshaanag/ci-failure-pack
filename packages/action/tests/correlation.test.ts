import { describe, expect, it, vi } from "vitest";
import type { ParsedTestOutput } from "@ci-failure-pack/shared";

import { correlateChangedFiles } from "../src/analyze/correlation.js";

function testOutput(file = "src/Button.test.tsx"): ParsedTestOutput {
  return {
    format: "jest-json" as const,
    total: 1,
    passed: 0,
    skipped: 0,
    failed: [{ name: "Button renders", file }],
    durationMs: 10,
    parserErrors: [],
  };
}

describe("correlateChangedFiles", () => {
  it("classifies a changed failing test as direct overlap", async () => {
    const result = await correlateChangedFiles({
      changedFiles: ["src/Button.test.tsx"],
      testOutput: testOutput(),
    });
    expect(result).toMatchObject({ classification: "direct", changedFile: "src/Button.test.tsx" });
  });

  it("classifies unrelated changes as no overlap", async () => {
    const result = await correlateChangedFiles({
      changedFiles: ["src/Button.tsx"],
      testOutput: testOutput("tests/payments.test.ts"),
      reader: { read: vi.fn().mockResolvedValue("import '../payments'") },
    });
    expect(result.classification).toBe("none");
  });

  it("classifies a changed direct import as indirect overlap", async () => {
    const result = await correlateChangedFiles({
      changedFiles: ["src/Button.tsx"],
      testOutput: testOutput(),
      reader: { read: vi.fn().mockResolvedValue("import Button from './Button';") },
    });
    expect(result).toMatchObject({
      classification: "indirect",
      failingFile: "src/Button.test.tsx",
      changedFile: "src/Button.tsx",
    });
  });

  it("returns unknown when no changed-file diff is available", async () => {
    const result = await correlateChangedFiles({ changedFiles: [], testOutput: testOutput() });
    expect(result.classification).toBe("unknown");
  });
});
