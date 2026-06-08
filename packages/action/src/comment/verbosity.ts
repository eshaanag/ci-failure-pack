import type {
  CacheState,
  CausalityScore,
  EnvironmentSnapshot,
  ParsedTestOutput,
} from "@ci-failure-pack/shared";

import type { FlakeClassification } from "../analyze/flakeDetector.js";

export const COMMENT_MARKER = "<!-- ci-failure-pack -->";

export interface CommentContext {
  jobName: string;
  testOutput: ParsedTestOutput;
  causality: readonly CausalityScore[];
  reproductionCommand: string;
  environment?: EnvironmentSnapshot;
  cacheState?: CacheState;
  flakeClassifications?: readonly FlakeClassification[];
  artifactUrl?: string;
  logTail?: string;
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function failureSummary(context: CommentContext): string {
  if (context.testOutput.failed.length === 0) {
    return "No structured test failure found — inspect the captured log tail";
  }
  const names = context.testOutput.failed.slice(0, 2).map(({ name }) => escapeCell(name));
  const remaining = context.testOutput.failed.length - names.length;
  return `${names.join(", ")}${remaining > 0 ? ` +${remaining} more` : ""} — ${context.testOutput.failed.length} assertions failed`;
}

function causeSummary(causality: readonly CausalityScore[]): string {
  const cause = causality[0];
  return cause === undefined
    ? "No specific cause identified — check log"
    : `${cause.label} (${Math.round(cause.percentage)}%)`;
}

function flakeBadgeLines(classifications: readonly FlakeClassification[] | undefined): string[] {
  return (classifications ?? [])
    .filter(({ classification }) => classification !== "unknown")
    .slice(0, 2)
    .map((classification) =>
      classification.classification === "flaky"
        ? `🔁 ${escapeCell(classification.testName)} — likely flaky (${classification.failureCount} failures, no related changes)`
        : `❌ ${escapeCell(classification.testName)} — likely broken by this PR (first failure on this commit)`,
    );
}

/** Renders the default brief PR comment. */
export function renderBriefComment(context: CommentContext): string {
  return [
    COMMENT_MARKER,
    `❌ ${context.jobName} failed`,
    failureSummary(context),
    ...flakeBadgeLines(context.flakeClassifications),
    `⚠ Likely: ${causeSummary(context.causality)}`,
    `▶ Reproduce: \`${context.reproductionCommand}\``,
  ].join("\n");
}

/** Renders the standard PR comment with bounded environment, cache, and artifact context. */
export function renderStandardComment(context: CommentContext): string {
  const lines = [
    renderBriefComment(context),
    "",
    "| Check | CI | Local action |",
    "| --- | --- | --- |",
  ];
  for (const variable of context.environment?.safe.slice(0, 4) ?? []) {
    lines.push(
      `| ${escapeCell(variable.name)} | ${escapeCell(variable.value)} | run \`ci-failure-pack diff\` |`,
    );
  }
  for (const variable of context.environment?.redacted.slice(0, 2) ?? []) {
    lines.push(`| ${escapeCell(variable.name)} | set (redacted) | check local presence |`);
  }
  for (const cache of context.cacheState?.caches.slice(0, 2) ?? []) {
    lines.push(
      `| Cache: ${escapeCell(cache.name)} | ${cache.hit ? "hit" : "miss"} | check workflow cache key |`,
    );
  }
  if (context.artifactUrl !== undefined) {
    lines.push("", `Artifact: [failure-pack.zip](${context.artifactUrl})`);
  }
  return lines.join("\n");
}

/** Renders the full PR comment with collapsible failures, environment, and log tail. */
export function renderFullComment(context: CommentContext): string {
  const failureRows = context.testOutput.failed
    .map(
      (failure) =>
        `| ${escapeCell(failure.name)} | ${escapeCell(failure.file ?? "unknown")} | ${escapeCell(failure.assertion ?? "See log")} |`,
    )
    .join("\n");
  const environmentLines = [
    ...(context.environment?.safe.map(({ name, value }) => `${name}=${value}`) ?? []),
    ...(context.environment?.redacted.map(({ name, marker }) => `${name}=${marker}`) ?? []),
  ].join("\n");
  return [
    renderStandardComment(context),
    "",
    "<details>",
    "<summary>Failed tests</summary>",
    "",
    "| Test | File | Assertion |",
    "| --- | --- | --- |",
    failureRows || "| No structured failures | unknown | See log |",
    "",
    "</details>",
    "",
    "<details>",
    "<summary>Environment snapshot</summary>",
    "",
    "```text",
    environmentLines,
    "```",
    "",
    "</details>",
    "",
    "<details>",
    "<summary>Log tail</summary>",
    "",
    "```text",
    context.logTail ?? "",
    "```",
    "",
    "</details>",
  ].join("\n");
}
