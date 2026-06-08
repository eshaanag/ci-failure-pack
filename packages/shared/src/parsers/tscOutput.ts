import type { ParsedTestOutput, TestFailure } from "../types/index.js";
import { emptyParsedTestOutput, parserError, rawParserInputSchema } from "./common.js";

const tscLinePattern = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;
const maxRenderedErrors = 5;

/** Parses TypeScript compiler output into normalized failure output. */
export function parseTscOutput(raw: string): ParsedTestOutput {
  const input = rawParserInputSchema.safeParse(raw);
  if (!input.success || input.data.trim() === "") {
    return emptyParsedTestOutput("tsc");
  }

  const failures: TestFailure[] = [];
  for (const line of input.data.split(/\r?\n/)) {
    const match = tscLinePattern.exec(line.trim());
    if (match === null) {
      continue;
    }
    const [, file, lineNumber, column, code, message] = match;
    if (
      file === undefined ||
      lineNumber === undefined ||
      column === undefined ||
      code === undefined ||
      message === undefined
    ) {
      continue;
    }
    failures.push({
      name: `${code}: ${message}`,
      file,
      line: Number(lineNumber),
      assertion: `${code}:${column} ${message}`,
    });
  }

  if (failures.length === 0) {
    return emptyParsedTestOutput("tsc", [
      parserError("Could not find TypeScript compiler errors in the provided output."),
    ]);
  }

  const rendered = failures.slice(0, maxRenderedErrors);
  const remaining = failures.length - rendered.length;
  return {
    format: "tsc",
    total: failures.length,
    passed: 0,
    skipped: 0,
    failed: rendered,
    durationMs: 0,
    parserErrors:
      remaining > 0
        ? [
            {
              message: `...and ${remaining} more TypeScript errors`,
              recovery: "Run tsc locally to inspect the remaining compiler errors.",
            },
          ]
        : [],
  };
}
