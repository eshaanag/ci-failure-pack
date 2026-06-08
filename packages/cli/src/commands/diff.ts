import type { EnvironmentSnapshot } from "@ci-failure-pack/shared";
import chalk from "chalk";
import Table from "cli-table3";

import { readFailurePack } from "../lib/bundleReader.js";
import { detectLocalEnvironment } from "../lib/localEnv.js";

export interface EnvironmentDiffRow {
  symbol: "✓" | "⚠";
  name: string;
  ci: string;
  local: string;
  status: "match" | "MISMATCH" | "missing locally";
}

function safeMap(snapshot: EnvironmentSnapshot): Map<string, string> {
  return new Map(snapshot.safe.map(({ name, value }) => [name, value]));
}

function requestedNames(snapshot: EnvironmentSnapshot): string[] {
  return [
    ...new Set([
      ...snapshot.safe.map(({ name }) => name),
      ...snapshot.redacted.map(({ name }) => name),
    ]),
  ];
}

/**
 * Compares CI and local environment snapshots.
 *
 * @param ci - CI environment snapshot from the bundle.
 * @param local - Local environment snapshot.
 * @returns Diff rows for matches, mismatches, and missing local values.
 */
export function diffEnvironmentSnapshots(
  ci: EnvironmentSnapshot,
  local: EnvironmentSnapshot,
): EnvironmentDiffRow[] {
  const localSafe = safeMap(local);
  const rows: EnvironmentDiffRow[] = [];
  for (const variable of ci.safe) {
    const localValue = localSafe.get(variable.name);
    if (localValue === undefined) {
      rows.push({
        symbol: "⚠",
        name: variable.name,
        ci: variable.value,
        local: "not set",
        status: "missing locally",
      });
    } else if (localValue === variable.value) {
      rows.push({
        symbol: "✓",
        name: variable.name,
        ci: variable.value,
        local: localValue,
        status: "match",
      });
    } else {
      rows.push({
        symbol: "⚠",
        name: variable.name,
        ci: variable.value,
        local: localValue,
        status: "MISMATCH",
      });
    }
  }
  for (const variable of ci.redacted) {
    const localValue = localSafe.get(variable.name);
    rows.push(
      localValue === undefined
        ? {
            symbol: "⚠",
            name: variable.name,
            ci: "set",
            local: "not set",
            status: "missing locally",
          }
        : { symbol: "✓", name: variable.name, ci: "set", local: "set", status: "match" },
    );
  }
  return rows;
}

/**
 * Renders environment diff rows as terminal output.
 *
 * @param rows - Diff rows from snapshot comparison.
 * @returns Human-readable diff output.
 */
export function renderEnvironmentDiff(rows: readonly EnvironmentDiffRow[]): string {
  const differences = rows.filter((row) => row.status !== "match");
  if (differences.length === 0) {
    return `${chalk.green("✓")} Environment matches CI`;
  }
  const table = new Table({ head: ["", "Name", "CI", "Local", "Result"], style: { head: [] } });
  for (const row of rows) {
    table.push([
      row.symbol === "✓" ? chalk.green(row.symbol) : chalk.yellow(row.symbol),
      row.name,
      row.ci,
      row.local,
      row.status === "match" ? chalk.green(row.status) : chalk.yellow(row.status),
    ]);
  }
  return table.toString();
}

/**
 * Reads a bundle, detects local values, and renders the CI/local environment diff.
 *
 * @param bundlePath - Path to failure-pack.zip.
 * @returns Rendered diff output.
 */
export async function diffBundle(bundlePath: string): Promise<string> {
  const bundle = await readFailurePack(bundlePath);
  const local = await detectLocalEnvironment({
    requestedEnvNames: requestedNames(bundle.environment),
  });
  return renderEnvironmentDiff(diffEnvironmentSnapshots(bundle.environment, local));
}
