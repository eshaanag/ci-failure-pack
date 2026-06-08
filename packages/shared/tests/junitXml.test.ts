import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseJunitXml } from "../src/parsers/junitXml.js";

const fixturePath = fileURLToPath(new URL("./fixtures/junit-sample.xml", import.meta.url));

describe("parseJunitXml", () => {
  it("parses normal JUnit failures from a fixture", () => {
    const result = parseJunitXml(readFileSync(fixturePath, "utf8"));

    expect(result).toMatchObject({ format: "junit", total: 4, passed: 1, skipped: 1 });
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0]).toMatchObject({
      name: "rejects duplicates",
      file: "tests/user.test.ts",
      line: 24,
      assertion: "expected 409, got 500",
    });
  });

  it("returns no failures when all tests pass", () => {
    const result = parseJunitXml(
      '<testsuite name="ok"><testcase name="one"/><testcase name="two"/></testsuite>',
    );
    expect(result).toMatchObject({ total: 2, passed: 2, failed: [] });
  });

  it("handles a report where all tests fail", () => {
    const result = parseJunitXml(
      '<testsuite name="bad"><testcase name="one"><failure>no</failure></testcase><testcase name="two"><error>also no</error></testcase></testsuite>',
    );
    expect(result).toMatchObject({ total: 2, passed: 0 });
    expect(result.failed).toHaveLength(2);
  });

  it("returns a non-fatal parser error for malformed input", () => {
    const result = parseJunitXml("<testsuite><testcase");
    expect(result.failed).toEqual([]);
    expect(result.parserErrors).not.toEqual([]);
  });

  it("returns an empty result for empty input", () => {
    expect(parseJunitXml("")).toMatchObject({ total: 0, passed: 0, failed: [], parserErrors: [] });
  });
});
