import { readFile } from "node:fs/promises";
import { posix, resolve, sep } from "node:path";

import {
  changedFileCorrelationSchema,
  parsedTestOutputSchema,
  type ChangedFileCorrelation,
  type ParsedTestOutput,
} from "@ci-failure-pack/shared";
import { z } from "zod";

const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*["'](\.[^"']+)["']/g;
const sourceExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

export interface CorrelationFileReader {
  read(path: string): Promise<string>;
}

export interface CorrelationOptions {
  changedFiles: readonly string[];
  testOutput: ParsedTestOutput;
  cwd?: string;
  reader?: CorrelationFileReader;
}

const defaultReader: CorrelationFileReader = {
  async read(path: string): Promise<string> {
    try {
      return await readFile(path, "utf8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown source read error";
      throw new Error(`Could not read failing test file ${path}: ${message}`, { cause: error });
    }
  },
};

function normalizePath(path: string): string {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

function importCandidates(testFile: string, content: string): string[] {
  const candidates: string[] = [];
  for (const match of content.matchAll(importPattern)) {
    const imported = match[1];
    if (imported === undefined) {
      continue;
    }
    const base = posix.normalize(posix.join(posix.dirname(normalizePath(testFile)), imported));
    for (const extension of sourceExtensions) {
      candidates.push(`${base}${extension}`);
      candidates.push(`${base}/index${extension}`);
    }
  }
  return candidates;
}

/**
 * Correlates failing test files with files changed in the current pull request.
 *
 * @param options - Changed files, parsed failures, working directory, and optional file reader.
 * @returns Direct, indirect, none, or unknown correlation with an explanation.
 */
export async function correlateChangedFiles(
  options: CorrelationOptions,
): Promise<ChangedFileCorrelation> {
  const changedFiles = z.array(z.string().min(1)).parse(options.changedFiles).map(normalizePath);
  const testOutput = parsedTestOutputSchema.parse(options.testOutput);
  if (changedFiles.length === 0) {
    return changedFileCorrelationSchema.parse({
      classification: "unknown",
      explanation: "No changed-file diff is available for this run.",
    });
  }

  const failingFiles = testOutput.failed
    .map(({ file }) => file)
    .filter((file): file is string => file !== undefined)
    .map(normalizePath);
  for (const failingFile of failingFiles) {
    if (changedFiles.includes(failingFile)) {
      return changedFileCorrelationSchema.parse({
        classification: "direct",
        failingFile,
        changedFile: failingFile,
        explanation: "The failing test file was changed in this pull request.",
      });
    }
  }

  const reader = options.reader ?? defaultReader;
  const cwd = options.cwd ?? process.cwd();
  for (const failingFile of failingFiles) {
    try {
      const content = await reader.read(resolve(cwd, failingFile));
      const importedChange = importCandidates(failingFile, content).find((candidate) =>
        changedFiles.includes(candidate),
      );
      if (importedChange !== undefined) {
        return changedFileCorrelationSchema.parse({
          classification: "indirect",
          failingFile,
          changedFile: importedChange,
          explanation: "The failing test imports a source file changed in this pull request.",
        });
      }
    } catch {
      continue;
    }
  }

  return changedFileCorrelationSchema.parse({
    classification: "none",
    explanation:
      failingFiles.length === 0
        ? "Failed tests did not include file paths, so no relationship was found."
        : "No direct or one-level import relationship was found; the failure may be pre-existing or flaky.",
  });
}
