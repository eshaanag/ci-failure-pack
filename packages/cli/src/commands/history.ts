import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  failureHistorySchema,
  type FailureHistory,
  type FlakeRecord,
} from "@ci-failure-pack/shared";
import chalk from "chalk";
import Table from "cli-table3";

export interface HistoryOptions {
  cwd?: string;
  historyPath?: string;
  readHistoryFile?: (path: string) => Promise<string>;
}

async function defaultReadHistoryFile(path: string): Promise<string> {
  try {
    await access(path);
  } catch (error: unknown) {
    throw new Error(
      "No failure history found. Run the action with flaky-detection: true to start collecting history.",
      { cause: error },
    );
  }
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown history read error";
    throw new Error(`Could not read failure history at ${path}: ${message}`, { cause: error });
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesQuery(record: FlakeRecord, query: string): boolean {
  const normalizedName = normalize(record.testName);
  const normalizedQuery = normalize(query);
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
    return true;
  }
  return normalizedQuery.split(" ").every((token) => normalizedName.includes(token));
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function renderTimeline(record: FlakeRecord, history: FailureHistory): string {
  const table = new Table({
    head: ["Date", "Commit", "Run", "Related changes"],
    style: { head: [] },
  });
  for (const failure of record.failures) {
    table.push([
      failure.failedAt.slice(0, 10),
      shortSha(failure.commitSha),
      failure.runId,
      failure.relatedFilesChanged ? "yes" : "no",
    ]);
  }
  return [
    `${chalk.cyan("▶")} ${record.testName}`,
    `Repository: ${history.repository}`,
    `Classification: ${record.classification}`,
    `Failures: ${record.failures.length}`,
    table.toString(),
  ].join("\n");
}

function renderMultipleMatches(query: string, matches: readonly FlakeRecord[]): string {
  const lines = [`${chalk.yellow("⚠")} Multiple tests match "${query}". Narrow the test name:`];
  for (const record of matches) {
    lines.push(`${chalk.cyan("→")} ${record.testName} (${record.failures.length} failures)`);
  }
  return lines.join("\n");
}

/**
 * Renders the failure timeline for a fuzzy-matched test name.
 *
 * @param query - Test name or partial test name to find.
 * @param options - Optional history path and injectable file reader.
 * @returns Human-readable history output.
 */
export async function renderHistory(query: string, options: HistoryOptions = {}): Promise<string> {
  const path = resolve(
    options.cwd ?? process.cwd(),
    options.historyPath ?? ".ci-failure-pack-history.json",
  );
  let raw: string;
  try {
    raw = await (options.readHistoryFile ?? defaultReadHistoryFile)(path);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown history read error";
    if (message.startsWith("No failure history found.")) {
      return message;
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    throw new Error(`History file ${path} is invalid JSON: ${message}`, { cause: error });
  }
  const history = failureHistorySchema.parse(parsed);
  const matches = history.records.filter((record) => matchesQuery(record, query));
  if (matches.length === 0) {
    return `No failure history found for "${query}". Try a test name from the CI Failure Pack PR comment.`;
  }
  if (matches.length > 1) {
    return renderMultipleMatches(query, matches);
  }
  return renderTimeline(matches[0]!, history);
}
