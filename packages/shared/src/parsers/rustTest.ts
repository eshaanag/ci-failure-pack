import type { ParsedTestOutput, TestFailure } from "../types/index.js";
import { emptyParsedTestOutput, parserError, rawParserInputSchema } from "./common.js";

const RESULT_LINE = /^test\s+(.+?)\s+\.\.\.\s+(ok|FAILED|ignored)$/;
const FAILURE_HEADER = /^----\s+(.+?)\s+stdout\s+----$/;

function failureDetails(lines: string[]): Map<string, string> {
  const details = new Map<string, string>();
  let current: string | undefined;
  let buffer: string[] = [];

  const flush = (): void => {
    if (current !== undefined && buffer.length > 0) {
      details.set(current, buffer.join("\n").trim());
    }
    buffer = [];
  };

  for (const line of lines) {
    const header = FAILURE_HEADER.exec(line.trim());
    if (header !== null) {
      flush();
      current = header[1];
      continue;
    }
    if (current !== undefined) {
      if (line.trim() === "failures:") {
        flush();
        current = undefined;
      } else {
        buffer.push(line);
      }
    }
  }
  flush();
  return details;
}

/** Parses Rust `cargo test` output into normalized failed-test output. */
export function parseRustTest(raw: string): ParsedTestOutput {
  const input = rawParserInputSchema.safeParse(raw);
  if (!input.success || input.data.trim() === "") {
    return emptyParsedTestOutput("rust-test");
  }

  const lines = input.data.split(/\r?\n/);
  const details = failureDetails(lines);
  const failed: TestFailure[] = [];
  let total = 0;
  let passed = 0;
  let skipped = 0;

  for (const line of lines) {
    const result = RESULT_LINE.exec(line.trim());
    if (result === null) {
      continue;
    }
    const name = result[1] ?? "Unnamed test";
    const status = result[2];
    total += 1;
    if (status === "ok") {
      passed += 1;
    } else if (status === "ignored") {
      skipped += 1;
    } else {
      const assertion = details.get(name);
      failed.push({ name, ...(assertion === undefined ? {} : { assertion, stack: assertion }) });
    }
  }

  const parserErrors = total === 0 ? [parserError("No Rust test result lines were found.")] : [];
  return { format: "rust-test", total, passed, skipped, failed, durationMs: 0, parserErrors };
}
