import { XMLParser } from "fast-xml-parser";

import type { ParsedTestOutput, TestFailure } from "../types/index.js";
import {
  asArray,
  emptyParsedTestOutput,
  isRecord,
  numberFrom,
  optionalString,
  parserError,
  rawParserInputSchema,
  unknownRecordSchema,
} from "./common.js";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true,
});

function failureText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return (
    optionalString(value["message"]) ??
    optionalString(value["#text"]) ??
    optionalString(value["type"])
  );
}

function parseTestCase(
  value: unknown,
  suiteName?: string,
): { status: "passed" | "failed" | "skipped"; durationMs: number; failure?: TestFailure } {
  if (!isRecord(value)) {
    return { status: "passed", durationMs: 0 };
  }

  const name = optionalString(value["name"]) ?? "Unnamed test";
  const durationMs = numberFrom(value["time"]) * 1_000;
  const failure = value["failure"] ?? value["error"];
  if (failure !== undefined) {
    const file = optionalString(value["file"]);
    const line = numberFrom(value["line"]);
    const assertion = failureText(failure);
    return {
      status: "failed",
      durationMs,
      failure: {
        name,
        durationMs,
        ...(suiteName === undefined ? {} : { suite: suiteName }),
        ...(file === undefined ? {} : { file }),
        ...(line > 0 ? { line } : {}),
        ...(assertion === undefined ? {} : { assertion }),
      },
    };
  }

  return { status: value["skipped"] === undefined ? "passed" : "skipped", durationMs };
}

function collectSuites(root: Record<string, unknown>): Record<string, unknown>[] {
  const suites: Record<string, unknown>[] = [];
  const visit = (value: unknown): void => {
    for (const candidate of asArray(value)) {
      if (isRecord(candidate)) {
        suites.push(candidate);
        visit(candidate["testsuite"]);
      }
    }
  };
  visit(root["testsuites"]);
  visit(root["testsuite"]);
  return suites;
}

/** Parses JUnit XML into normalized failed-test output. */
export function parseJunitXml(raw: string): ParsedTestOutput {
  const input = rawParserInputSchema.safeParse(raw);
  if (!input.success || input.data.trim() === "") {
    return emptyParsedTestOutput("junit");
  }

  try {
    const parsed: unknown = xmlParser.parse(input.data);
    const root = unknownRecordSchema.safeParse(parsed);
    if (!root.success) {
      return emptyParsedTestOutput("junit", [
        parserError("JUnit XML did not contain an object root."),
      ]);
    }

    const failed: TestFailure[] = [];
    let total = 0;
    let passed = 0;
    let skipped = 0;
    let durationMs = 0;
    for (const suite of collectSuites(root.data)) {
      const suiteName = optionalString(suite["name"]);
      for (const testCase of asArray(suite["testcase"])) {
        const result = parseTestCase(testCase, suiteName);
        total += 1;
        durationMs += result.durationMs;
        if (result.status === "passed") passed += 1;
        if (result.status === "skipped") skipped += 1;
        if (result.failure !== undefined) failed.push(result.failure);
      }
    }

    if (total === 0) {
      return emptyParsedTestOutput("junit", [
        parserError("No JUnit test cases were found in the report."),
      ]);
    }
    return { format: "junit", total, passed, skipped, failed, durationMs, parserErrors: [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown XML parsing error";
    return emptyParsedTestOutput("junit", [parserError(`Could not parse JUnit XML: ${message}`)]);
  }
}
