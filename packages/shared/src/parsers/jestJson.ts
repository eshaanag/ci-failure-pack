import { z } from "zod";

import type { ParsedTestOutput, TestFailure } from "../types/index.js";
import { emptyParsedTestOutput, parserError, rawParserInputSchema } from "./common.js";

const assertionSchema = z
  .object({
    title: z.string().optional(),
    fullName: z.string().optional(),
    status: z.string().optional(),
    duration: z.number().nonnegative().nullable().optional(),
    failureMessages: z.array(z.string()).optional(),
    location: z.object({ line: z.number().int().positive().optional() }).optional(),
  })
  .passthrough();

const testFileSchema = z
  .object({
    name: z.string().optional(),
    assertionResults: z.array(assertionSchema).optional(),
  })
  .passthrough();

const jestReportSchema = z
  .object({
    testResults: z.array(testFileSchema).optional(),
  })
  .passthrough();

/** Parses Jest or Vitest JSON reporter output into normalized failed-test output. */
export function parseJestJson(raw: string): ParsedTestOutput {
  const input = rawParserInputSchema.safeParse(raw);
  if (!input.success || input.data.trim() === "") {
    return emptyParsedTestOutput("jest-json");
  }

  try {
    const decoded: unknown = JSON.parse(input.data);
    const report = jestReportSchema.safeParse(decoded);
    if (!report.success) {
      return emptyParsedTestOutput("jest-json", [
        parserError("Jest JSON report shape is invalid."),
      ]);
    }

    const failed: TestFailure[] = [];
    let total = 0;
    let passed = 0;
    let skipped = 0;
    let durationMs = 0;
    for (const testFile of report.data.testResults ?? []) {
      for (const assertion of testFile.assertionResults ?? []) {
        total += 1;
        durationMs += assertion.duration ?? 0;
        if (assertion.status === "passed") {
          passed += 1;
        } else if (assertion.status === "failed") {
          failed.push({
            name: assertion.fullName ?? assertion.title ?? "Unnamed test",
            ...(testFile.name === undefined ? {} : { file: testFile.name }),
            ...(assertion.location?.line === undefined ? {} : { line: assertion.location.line }),
            ...(assertion.failureMessages?.[0] === undefined
              ? {}
              : {
                  assertion: assertion.failureMessages[0],
                  stack: assertion.failureMessages.join("\n"),
                }),
            ...(assertion.duration === null || assertion.duration === undefined
              ? {}
              : { durationMs: assertion.duration }),
          });
        } else {
          skipped += 1;
        }
      }
    }

    return { format: "jest-json", total, passed, skipped, failed, durationMs, parserErrors: [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown JSON parsing error";
    return emptyParsedTestOutput("jest-json", [
      parserError(`Could not parse Jest JSON: ${message}`),
    ]);
  }
}
