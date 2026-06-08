import { z } from "zod";

import type { ParsedTestOutput, TestFailure } from "../types/index.js";
import { emptyParsedTestOutput, parserError, rawParserInputSchema } from "./common.js";

const eslintMessageSchema = z
  .object({
    ruleId: z.string().nullable().optional(),
    severity: z.number().optional(),
    message: z.string().optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
  })
  .passthrough();

const eslintFileSchema = z
  .object({
    filePath: z.string().optional(),
    messages: z.array(eslintMessageSchema).optional(),
  })
  .passthrough();

const eslintReportSchema = z.array(eslintFileSchema);

/** Parses ESLint JSON formatter output into normalized failure output. */
export function parseEslintJson(raw: string): ParsedTestOutput {
  const input = rawParserInputSchema.safeParse(raw);
  if (!input.success || input.data.trim() === "") {
    return emptyParsedTestOutput("eslint-json");
  }

  try {
    const decoded: unknown = JSON.parse(input.data);
    const report = eslintReportSchema.safeParse(decoded);
    if (!report.success) {
      return emptyParsedTestOutput("eslint-json", [
        parserError("ESLint JSON report shape is invalid."),
      ]);
    }

    const failed: TestFailure[] = [];
    for (const file of report.data) {
      for (const message of file.messages ?? []) {
        if (message.severity !== 2) {
          continue;
        }
        const rule = message.ruleId ?? "eslint";
        const text = message.message ?? "ESLint error";
        failed.push({
          name: `${rule}: ${text}`,
          ...(file.filePath === undefined ? {} : { file: file.filePath }),
          ...(message.line === undefined ? {} : { line: message.line }),
          assertion: `${rule}${message.column === undefined ? "" : `:${message.column}`} ${text}`,
        });
      }
    }

    return {
      format: "eslint-json",
      total: failed.length,
      passed: 0,
      skipped: 0,
      failed,
      durationMs: 0,
      parserErrors: [],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown JSON parsing error";
    return emptyParsedTestOutput("eslint-json", [
      parserError(`Could not parse ESLint JSON: ${message}`),
    ]);
  }
}
