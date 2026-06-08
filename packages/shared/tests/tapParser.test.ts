import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseTap } from "../src/parsers/tapParser.js";

const fixturePath = fileURLToPath(new URL("./fixtures/tap-output.txt", import.meta.url));

describe("parseTap", () => {
  it("parses normal TAP failures from a fixture", () => {
    const result = parseTap(readFileSync(fixturePath, "utf8"));
    expect(result).toMatchObject({ total: 4, passed: 2, skipped: 0 });
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0]).toMatchObject({
      name: "rejects duplicates",
      file: "tests/user.test.ts",
      line: 24,
      assertion: "expected 409, got 500",
    });
  });

  it("returns no failures when all tests pass", () => {
    expect(parseTap("TAP version 13\n1..2\nok 1 - one\nok 2 - two")).toMatchObject({
      total: 2,
      passed: 2,
      failed: [],
    });
  });

  it("handles a report where all tests fail", () => {
    const result = parseTap("not ok 1 - one\nnot ok 2 - two");
    expect(result.failed).toHaveLength(2);
    expect(result.passed).toBe(0);
  });

  it("returns a partial result for truncated TAP", () => {
    const result = parseTap("not ok 1 - one\n  ---\n  message: incomplete");
    expect(result.failed[0]?.assertion).toBe("incomplete");
    expect(result.parserErrors).toEqual([]);
  });

  it("returns an empty result for empty input", () => {
    expect(parseTap("")).toMatchObject({ total: 0, failed: [], parserErrors: [] });
  });
});
