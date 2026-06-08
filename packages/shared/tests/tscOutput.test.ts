import { describe, expect, it } from "vitest";

import { parseTscOutput } from "../src/parsers/tscOutput.js";

function tscLine(index: number): string {
  return `src/file${index}.ts(${index},${index + 1}): error TS23${index}: Problem ${index}`;
}

describe("parseTscOutput", () => {
  it("parses TypeScript compiler errors", () => {
    const result = parseTscOutput([tscLine(1), tscLine(2)].join("\n"));

    expect(result).toMatchObject({ format: "tsc", total: 2 });
    expect(result.failed[0]).toMatchObject({
      name: "TS231: Problem 1",
      file: "src/file1.ts",
      line: 1,
      assertion: "TS231:2 Problem 1",
    });
  });

  it("renders the first 5 errors and reports the remaining count", () => {
    const result = parseTscOutput(
      Array.from({ length: 10 }, (_, index) => tscLine(index + 1)).join("\n"),
    );

    expect(result.total).toBe(10);
    expect(result.failed).toHaveLength(5);
    expect(result.parserErrors[0]?.message).toBe("...and 5 more TypeScript errors");
  });

  it("returns a parser error for malformed output", () => {
    const result = parseTscOutput("not tsc output");

    expect(result.failed).toEqual([]);
    expect(result.parserErrors[0]?.message).toContain("Could not find TypeScript");
  });

  it("returns empty output for empty input", () => {
    expect(parseTscOutput("")).toMatchObject({ total: 0, failed: [], parserErrors: [] });
  });
});
