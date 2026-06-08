import { describe, expect, it } from "vitest";

import { parseEslintJson } from "../src/parsers/eslintJson.js";

describe("parseEslintJson", () => {
  it("parses 3 errors in 2 files from ESLint JSON output", () => {
    const result = parseEslintJson(
      JSON.stringify([
        {
          filePath: "src/a.ts",
          messages: [
            {
              ruleId: "no-console",
              severity: 2,
              message: "Unexpected console.",
              line: 3,
              column: 5,
            },
            { ruleId: "semi", severity: 2, message: "Missing semicolon.", line: 4, column: 10 },
          ],
        },
        {
          filePath: "src/b.ts",
          messages: [
            { ruleId: "eqeqeq", severity: 2, message: "Expected ===.", line: 8, column: 12 },
            { ruleId: "quotes", severity: 1, message: "Prefer double quotes.", line: 9 },
          ],
        },
      ]),
    );

    expect(result).toMatchObject({ format: "eslint-json", total: 3 });
    expect(result.failed).toHaveLength(3);
    expect(result.failed[0]).toMatchObject({
      name: "no-console: Unexpected console.",
      file: "src/a.ts",
      line: 3,
      assertion: "no-console:5 Unexpected console.",
    });
  });

  it("returns empty output for an empty report", () => {
    expect(parseEslintJson("[]")).toMatchObject({ total: 0, failed: [] });
  });

  it("returns a parser error for malformed JSON", () => {
    const result = parseEslintJson("[");
    expect(result.failed).toEqual([]);
    expect(result.parserErrors[0]?.message).toContain("Could not parse ESLint JSON");
  });
});
