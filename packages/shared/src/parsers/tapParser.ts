import type { ParsedTestOutput, TestFailure } from "../types/index.js";
import { emptyParsedTestOutput, parserError, rawParserInputSchema } from "./common.js";

const RESULT_LINE = /^(not ok|ok)\b(?:\s+\d+)?(?:\s*-\s*)?(.*)$/;
const DIAGNOSTIC_LINE = /^\s*(file|line|message|stack|time):\s*(.*)$/;

function cleanDiagnosticValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/** Parses TAP protocol output into normalized failed-test output. */
export function parseTap(raw: string): ParsedTestOutput {
  const input = rawParserInputSchema.safeParse(raw);
  if (!input.success || input.data.trim() === "") {
    return emptyParsedTestOutput("tap");
  }

  const failed: TestFailure[] = [];
  let total = 0;
  let passed = 0;
  let skipped = 0;
  let durationMs = 0;
  let currentFailure: TestFailure | undefined;

  for (const line of input.data.split(/\r?\n/)) {
    const result = RESULT_LINE.exec(line.trim());
    if (result !== null) {
      total += 1;
      const isFailed = result[1] === "not ok";
      const name = (result[2] ?? "Unnamed test").replace(/\s+#.*$/, "").trim() || "Unnamed test";
      const isSkipped = /#\s*(?:skip|todo)\b/i.test(line);
      if (isSkipped) {
        skipped += 1;
        currentFailure = undefined;
      } else if (isFailed) {
        currentFailure = { name };
        failed.push(currentFailure);
      } else {
        passed += 1;
        currentFailure = undefined;
      }
      continue;
    }

    if (currentFailure === undefined) {
      continue;
    }
    const diagnostic = DIAGNOSTIC_LINE.exec(line);
    if (diagnostic === null) {
      continue;
    }
    const key = diagnostic[1];
    const value = cleanDiagnosticValue(diagnostic[2] ?? "");
    if (key === "file" && value !== "") currentFailure.file = value;
    if (key === "line" && Number.isInteger(Number(value))) currentFailure.line = Number(value);
    if (key === "message" && value !== "") currentFailure.assertion = value;
    if (key === "stack" && value !== "") currentFailure.stack = value;
    if (key === "time") {
      const parsedDuration = Number.parseFloat(value);
      if (Number.isFinite(parsedDuration)) {
        currentFailure.durationMs = parsedDuration;
        durationMs += parsedDuration;
      }
    }
  }

  const parserErrors = total === 0 ? [parserError("No TAP result lines were found.")] : [];
  return { format: "tap", total, passed, skipped, failed, durationMs, parserErrors };
}
