import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parsePlaywrightJson } from "../src/parsers/playwrightJson.js";

const fixturePath = fileURLToPath(new URL("./fixtures/playwright-report.json", import.meta.url));

describe("parsePlaywrightJson", () => {
  it("parses normal Playwright failures from a fixture", () => {
    const result = parsePlaywrightJson(readFileSync(fixturePath, "utf8"));
    expect(result).toMatchObject({ total: 3, passed: 1, skipped: 0 });
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0]).toMatchObject({
      file: "tests/login.spec.ts",
      line: 22,
      assertion: "expected visible error",
    });
  });

  it("returns no failures when all tests pass", () => {
    const result = parsePlaywrightJson(
      JSON.stringify({
        suites: [{ specs: [{ tests: [{ title: "one", results: [{ status: "passed" }] }] }] }],
      }),
    );
    expect(result).toMatchObject({ total: 1, passed: 1, failed: [] });
  });

  it("handles a report where all tests fail", () => {
    const result = parsePlaywrightJson(
      JSON.stringify({
        suites: [{ specs: [{ tests: [{ title: "one", results: [{ status: "failed" }] }] }] }],
      }),
    );
    expect(result.failed).toHaveLength(1);
    expect(result.passed).toBe(0);
  });

  it("returns a non-fatal parser error for malformed input", () => {
    const result = parsePlaywrightJson('{"suites":');
    expect(result.failed).toEqual([]);
    expect(result.parserErrors).not.toEqual([]);
  });

  it("returns an empty result for empty input", () => {
    expect(parsePlaywrightJson("")).toMatchObject({ total: 0, failed: [], parserErrors: [] });
  });
});
