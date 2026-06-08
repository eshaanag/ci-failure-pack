import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseJestJson } from "../src/parsers/jestJson.js";

const fixturePath = fileURLToPath(new URL("./fixtures/jest-output.json", import.meta.url));

describe("parseJestJson", () => {
  it("parses normal Jest failures from a fixture", () => {
    const result = parseJestJson(readFileSync(fixturePath, "utf8"));
    expect(result).toMatchObject({ total: 4, passed: 2, skipped: 0 });
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0]).toMatchObject({
      name: "UserService rejects duplicates",
      file: "tests/user.test.ts",
      line: 24,
      assertion: "expected 409, got 500",
    });
  });

  it("returns no failures when all tests pass", () => {
    const result = parseJestJson(
      JSON.stringify({ testResults: [{ assertionResults: [{ title: "one", status: "passed" }] }] }),
    );
    expect(result).toMatchObject({ total: 1, passed: 1, failed: [] });
  });

  it("handles a report where all tests fail", () => {
    const result = parseJestJson(
      JSON.stringify({
        testResults: [
          {
            assertionResults: [
              { title: "one", status: "failed" },
              { title: "two", status: "failed" },
            ],
          },
        ],
      }),
    );
    expect(result.failed).toHaveLength(2);
    expect(result.passed).toBe(0);
  });

  it("returns a non-fatal parser error for malformed input", () => {
    const result = parseJestJson('{"testResults":');
    expect(result.failed).toEqual([]);
    expect(result.parserErrors).not.toEqual([]);
  });

  it("returns an empty result for empty input", () => {
    expect(parseJestJson("")).toMatchObject({ total: 0, failed: [], parserErrors: [] });
  });
});
