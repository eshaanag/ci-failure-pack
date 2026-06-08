import type { ParsedTestOutput, TestOutputFormat } from "../types/index.js";
import { emptyParsedTestOutput, rawParserInputSchema } from "./common.js";
import { parseGoTest } from "./goTest.js";
import { parseJestJson } from "./jestJson.js";
import { parseJunitXml } from "./junitXml.js";
import { parsePlaywrightJson } from "./playwrightJson.js";
import { parseRustTest } from "./rustTest.js";
import { parseTap } from "./tapParser.js";

function lowerPath(filePath: string | undefined): string {
  return filePath?.toLowerCase() ?? "";
}

function sniffJson(content: string): TestOutputFormat | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }
    if ("testResults" in parsed) return "jest-json";
    if ("suites" in parsed) return "playwright-json";
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Detects the likely test output format from a file path and content sample.
 *
 * @param filePath - Optional report path or file name.
 * @param raw - Raw report content.
 * @returns The detected test output format, or unknown.
 */
export function detectTestOutputFormat(
  filePath: string | undefined,
  raw: string,
): TestOutputFormat {
  const input = rawParserInputSchema.safeParse(raw);
  const content = input.success ? input.data.trimStart() : "";
  const path = lowerPath(filePath);

  if (
    path.endsWith(".xml") ||
    content.startsWith("<testsuite") ||
    content.startsWith("<testsuites")
  ) {
    return "junit";
  }
  if (path.endsWith(".tap") || content.startsWith("TAP version") || /^not ok\b/m.test(content)) {
    return "tap";
  }
  if (path.endsWith(".json")) {
    return sniffJson(content) ?? "jest-json";
  }
  if (/^=== RUN\s+/m.test(content) || /^--- (?:PASS|FAIL|SKIP):/m.test(content)) {
    return "go-test";
  }
  if (
    /^running \d+ tests?/m.test(content) &&
    /^test .+ \.\.\. (?:ok|FAILED|ignored)$/m.test(content)
  ) {
    return "rust-test";
  }
  return sniffJson(content) ?? "unknown";
}

/**
 * Parses raw test output by auto-detecting its format.
 *
 * @param raw - Raw report content.
 * @param filePath - Optional report path or file name.
 * @returns Normalized parsed test output.
 */
export function parseTestOutput(raw: string, filePath?: string): ParsedTestOutput {
  const format = detectTestOutputFormat(filePath, raw);
  if (format === "junit") return parseJunitXml(raw);
  if (format === "jest-json") return parseJestJson(raw);
  if (format === "tap") return parseTap(raw);
  if (format === "playwright-json") return parsePlaywrightJson(raw);
  if (format === "go-test") return parseGoTest(raw);
  if (format === "rust-test") return parseRustTest(raw);
  return emptyParsedTestOutput("unknown");
}
