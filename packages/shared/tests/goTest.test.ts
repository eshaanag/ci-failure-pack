import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseGoTest } from "../src/parsers/goTest.js";

const fixturePath = fileURLToPath(new URL("./fixtures/go-test-output.txt", import.meta.url));

describe("parseGoTest", () => {
  it("parses normal Go test failures from a fixture", () => {
    const result = parseGoTest(readFileSync(fixturePath, "utf8"));
    expect(result).toMatchObject({ total: 4, passed: 2, skipped: 0 });
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0]).toMatchObject({
      name: "TestRejectDuplicate",
      file: "user_test.go",
      line: 24,
    });
  });

  it("returns no failures when all tests pass", () => {
    expect(parseGoTest("=== RUN   TestOne\n--- PASS: TestOne (0.01s)")).toMatchObject({
      total: 1,
      passed: 1,
      failed: [],
    });
  });

  it("handles output where all tests fail", () => {
    const result = parseGoTest(
      "=== RUN   TestOne\n--- FAIL: TestOne (0.01s)\n=== RUN   TestTwo\n--- FAIL: TestTwo (0.01s)",
    );
    expect(result.failed).toHaveLength(2);
    expect(result.passed).toBe(0);
  });

  it("returns a partial result for truncated output", () => {
    const result = parseGoTest("--- FAIL: TestOne (0.01s)\nFAIL");
    expect(result.failed).toHaveLength(1);
    expect(result.parserErrors).toEqual([]);
  });

  it("returns an empty result for empty input", () => {
    expect(parseGoTest("")).toMatchObject({ total: 0, failed: [], parserErrors: [] });
  });
});
