import type { ParsedTestOutput, TestFailure } from "../types/index.js";
import { emptyParsedTestOutput, parserError, rawParserInputSchema } from "./common.js";

const RUN_LINE = /^=== RUN\s+(.+)$/;
const RESULT_LINE = /^--- (PASS|FAIL|SKIP):\s+(\S+)\s+\(([\d.]+)s\)$/;
const FILE_LINE = /^\s*([^:\s]+_test\.go):(\d+):\s*(.*)$/;

/** Parses `go test -v` output into normalized failed-test output. */
export function parseGoTest(raw: string): ParsedTestOutput {
  const input = rawParserInputSchema.safeParse(raw);
  if (!input.success || input.data.trim() === "") {
    return emptyParsedTestOutput("go-test");
  }

  const outputByTest = new Map<string, string[]>();
  const failed: TestFailure[] = [];
  let currentTest: string | undefined;
  let total = 0;
  let passed = 0;
  let skipped = 0;
  let durationMs = 0;

  for (const line of input.data.split(/\r?\n/)) {
    const run = RUN_LINE.exec(line.trim());
    if (run !== null) {
      currentTest = run[1];
      if (currentTest !== undefined && !outputByTest.has(currentTest)) {
        outputByTest.set(currentTest, []);
      }
      continue;
    }

    const result = RESULT_LINE.exec(line.trim());
    if (result !== null) {
      const status = result[1];
      const name = result[2] ?? "Unnamed test";
      const testDurationMs = Number.parseFloat(result[3] ?? "0") * 1_000;
      const output = outputByTest.get(name) ?? outputByTest.get(currentTest ?? "") ?? [];
      total += 1;
      durationMs += testDurationMs;
      if (status === "PASS") {
        passed += 1;
      } else if (status === "SKIP") {
        skipped += 1;
      } else {
        const locationLine = output.find((entry) => FILE_LINE.test(entry));
        const location = locationLine === undefined ? null : FILE_LINE.exec(locationLine);
        failed.push({
          name,
          ...(location?.[1] === undefined ? {} : { file: location[1] }),
          ...(location?.[2] === undefined ? {} : { line: Number(location[2]) }),
          ...(output.length === 0 ? {} : { assertion: output.join("\n").trim() }),
          durationMs: testDurationMs,
        });
      }
      currentTest = undefined;
      continue;
    }

    if (currentTest !== undefined && line.trim() !== "") {
      outputByTest.get(currentTest)?.push(line.trim());
    }
  }

  const parserErrors = total === 0 ? [parserError("No Go test result lines were found.")] : [];
  return { format: "go-test", total, passed, skipped, failed, durationMs, parserErrors };
}
