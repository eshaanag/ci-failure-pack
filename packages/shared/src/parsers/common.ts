import { z } from "zod";

import type { ParsedTestOutput, ParserError, TestOutputFormat } from "../types/index.js";

export const rawParserInputSchema = z.string();
export const unknownRecordSchema = z.record(z.string(), z.unknown());

/** Creates an empty normalized parser result. */
export function emptyParsedTestOutput(
  format: TestOutputFormat,
  parserErrors: ParserError[] = [],
): ParsedTestOutput {
  return { format, total: 0, passed: 0, skipped: 0, failed: [], durationMs: 0, parserErrors };
}

/** Converts a possibly singular value to an array. */
export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/** Returns whether an unknown value is a plain record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return unknownRecordSchema.safeParse(value).success;
}

/** Converts an unknown value to a finite number with a fallback. */
export function numberFrom(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Converts an unknown value to a non-empty string when possible. */
export function optionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/** Builds a consistent non-fatal parser error. */
export function parserError(message: string): ParserError {
  return {
    message,
    recovery: "Check that the test report is complete and uses a supported reporter format.",
  };
}
