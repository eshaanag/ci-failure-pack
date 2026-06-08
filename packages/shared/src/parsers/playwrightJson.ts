import { z } from "zod";

import type { ParsedTestOutput, TestFailure } from "../types/index.js";
import { emptyParsedTestOutput, parserError, rawParserInputSchema } from "./common.js";

const errorSchema = z
  .object({ message: z.string().optional(), stack: z.string().optional() })
  .passthrough();
const resultSchema = z
  .object({
    status: z.string().optional(),
    duration: z.number().nonnegative().optional(),
    errors: z.array(errorSchema).optional(),
  })
  .passthrough();

const testSchema = z
  .object({
    title: z.string().optional(),
    expectedStatus: z.string().optional(),
    results: z.array(resultSchema).optional(),
  })
  .passthrough();

const specSchema = z
  .object({
    title: z.string().optional(),
    file: z.string().optional(),
    line: z.number().int().positive().optional(),
    tests: z.array(testSchema).optional(),
  })
  .passthrough();

interface PlaywrightSuite {
  title?: string | undefined;
  specs?: z.infer<typeof specSchema>[] | undefined;
  suites?: PlaywrightSuite[] | undefined;
}

const suiteSchema: z.ZodType<PlaywrightSuite> = z.lazy(() =>
  z
    .object({
      title: z.string().optional(),
      specs: z.array(specSchema).optional(),
      suites: z.array(suiteSchema).optional(),
    })
    .passthrough(),
);

const playwrightReportSchema = z.object({ suites: z.array(suiteSchema).optional() }).passthrough();

function visitSuites(
  suites: PlaywrightSuite[] | undefined,
  visitor: (suite: PlaywrightSuite) => void,
): void {
  for (const suite of suites ?? []) {
    visitor(suite);
    visitSuites(suite.suites, visitor);
  }
}

/** Parses Playwright JSON reporter output into normalized failed-test output. */
export function parsePlaywrightJson(raw: string): ParsedTestOutput {
  const input = rawParserInputSchema.safeParse(raw);
  if (!input.success || input.data.trim() === "") {
    return emptyParsedTestOutput("playwright-json");
  }

  try {
    const decoded: unknown = JSON.parse(input.data);
    const report = playwrightReportSchema.safeParse(decoded);
    if (!report.success) {
      return emptyParsedTestOutput("playwright-json", [
        parserError("Playwright JSON report shape is invalid."),
      ]);
    }

    const failed: TestFailure[] = [];
    let total = 0;
    let passed = 0;
    let skipped = 0;
    let durationMs = 0;

    visitSuites(report.data.suites, (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const result = test.results?.at(-1);
          total += 1;
          durationMs += result?.duration ?? 0;
          if (result?.status === "passed") {
            passed += 1;
          } else if (result?.status === "skipped") {
            skipped += 1;
          } else {
            const error = result?.errors?.[0];
            failed.push({
              name:
                [suite.title, spec.title, test.title].filter(Boolean).join(" > ") || "Unnamed test",
              ...(spec.file === undefined ? {} : { file: spec.file }),
              ...(spec.line === undefined ? {} : { line: spec.line }),
              ...(error?.message === undefined ? {} : { assertion: error.message }),
              ...(error?.stack === undefined ? {} : { stack: error.stack }),
              ...(result?.duration === undefined ? {} : { durationMs: result.duration }),
            });
          }
        }
      }
    });

    return {
      format: "playwright-json",
      total,
      passed,
      skipped,
      failed,
      durationMs,
      parserErrors: [],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown JSON parsing error";
    return emptyParsedTestOutput("playwright-json", [
      parserError(`Could not parse Playwright JSON: ${message}`),
    ]);
  }
}
