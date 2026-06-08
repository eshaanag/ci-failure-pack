import chalk from "chalk";

import type { ReadableFailurePack } from "../lib/bundleReader.js";
import { readFailurePack } from "../lib/bundleReader.js";

/**
 * Renders a human-readable terminal summary of a validated failure pack.
 *
 * @param bundle - Validated bundle data.
 * @returns Plain terminal output with optional chalk styling.
 */
export function renderBundleInspection(bundle: ReadableFailurePack): string {
  const lines = [
    chalk.bold("CI Failure Pack"),
    `${chalk.gray("Captured:")} ${bundle.manifest.capturedAt}`,
    `${chalk.gray("Job:")} ${bundle.manifest.workflow.jobName}`,
    `${chalk.gray("Commit:")} ${bundle.gitContext.sha ?? "unknown"} (${bundle.gitContext.branch ?? "unknown branch"})`,
    "",
    chalk.bold.red(`✕ Failed tests (${bundle.testOutput.failed.length})`),
  ];
  if (bundle.testOutput.failed.length === 0) {
    lines.push("No structured test failures were captured.");
  } else {
    for (const failure of bundle.testOutput.failed) {
      lines.push(`✕ ${failure.name}  ${chalk.gray(failure.file ?? "unknown file")}`);
      if (failure.assertion !== undefined) lines.push(`  ${failure.assertion}`);
    }
  }
  lines.push("", chalk.bold("Environment"));
  for (const variable of bundle.environment.safe)
    lines.push(`✓ ${variable.name}=${variable.value}`);
  for (const variable of bundle.environment.redacted)
    lines.push(`⚠ ${variable.name}=${variable.marker}`);
  lines.push("", chalk.bold("Likely causes"));
  if (bundle.causality.length === 0) lines.push("⚠ No causality scores captured.");
  else
    for (const cause of bundle.causality)
      lines.push(`⚠ ${cause.label} (${cause.percentage}%) — ${cause.evidence}`);
  lines.push("", chalk.bold("Reproduction"));
  if (bundle.reproduction === undefined) {
    lines.push(`▶ ${bundle.failedCommand.command ?? "No reproduction command captured."}`);
  } else {
    for (const reproductionStep of bundle.reproduction.commands) {
      lines.push(`▶ ${reproductionStep.command}`);
      lines.push(`  ${chalk.gray(reproductionStep.reason)}`);
    }
  }
  return lines.join("\n");
}

/**
 * Reads and renders a failure pack for the inspect CLI command.
 *
 * @param bundlePath - Path to failure-pack.zip.
 * @returns Rendered terminal summary.
 */
export async function inspectBundle(bundlePath: string): Promise<string> {
  return renderBundleInspection(await readFailurePack(bundlePath));
}
