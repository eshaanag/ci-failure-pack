import { execFile } from "node:child_process";
import { platform, release } from "node:os";
import { promisify } from "node:util";

import { environmentSnapshotSchema, type EnvironmentSnapshot } from "@ci-failure-pack/shared";

const execFileAsync = promisify(execFile);

export interface LocalCommandRunner {
  run(command: string, args: readonly string[]): Promise<string>;
}

export interface LocalEnvironmentOptions {
  requestedEnvNames?: readonly string[];
  runner?: LocalCommandRunner;
  env?: Readonly<Record<string, string | undefined>>;
  capturedAt?: string;
}

const defaultRunner: LocalCommandRunner = {
  async run(command: string, args: readonly string[]): Promise<string> {
    try {
      const result = await execFileAsync(command, [...args], { encoding: "utf8" });
      return `${result.stdout}${result.stderr}`.trim();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown local command error";
      throw new Error(`Could not run ${command} ${args.join(" ")}: ${message}`, { cause: error });
    }
  },
};

function firstVersion(value: string): string {
  return value.replace(/^v/, "").match(/\d+(?:\.\d+){0,2}/)?.[0] ?? value.trim();
}

async function detectTool(
  safe: EnvironmentSnapshot["safe"],
  runner: LocalCommandRunner,
  name: string,
  command: string,
  args: readonly string[],
  parser: (value: string) => string = firstVersion,
): Promise<void> {
  try {
    safe.push({ name, value: parser(await runner.run(command, args)), source: "detected" });
  } catch {
    // Missing local tools are reported as differences only when CI had the value.
  }
}

/**
 * Detects local runtime, package-manager, OS, and requested environment values.
 *
 * @param options - Optional command runner, env map, and names requested by the CI snapshot.
 * @returns A schema-validated local environment snapshot.
 */
export async function detectLocalEnvironment(
  options: LocalEnvironmentOptions = {},
): Promise<EnvironmentSnapshot> {
  const runner = options.runner ?? defaultRunner;
  const env = options.env ?? process.env;
  const safe: EnvironmentSnapshot["safe"] = [
    { name: "OS", value: `${platform()} ${release()}`, source: "detected" },
  ];

  for (const name of options.requestedEnvNames ?? []) {
    const value = env[name];
    if (value !== undefined) {
      safe.push({ name, value, source: "process" });
    }
  }

  await detectTool(safe, runner, "NODE_VERSION", "node", ["--version"]);
  await detectTool(safe, runner, "PYTHON_VERSION", "python", ["--version"]);
  await detectTool(
    safe,
    runner,
    "GO_VERSION",
    "go",
    ["version"],
    (value) => value.match(/go\d+(?:\.\d+){0,2}/)?.[0].replace(/^go/, "") ?? value,
  );
  await detectTool(safe, runner, "RUST_VERSION", "rustc", ["--version"]);
  await detectTool(safe, runner, "PNPM_VERSION", "pnpm", ["--version"]);
  await detectTool(safe, runner, "NPM_VERSION", "npm", ["--version"]);
  await detectTool(safe, runner, "YARN_VERSION", "yarn", ["--version"]);
  await detectTool(safe, runner, "BUN_VERSION", "bun", ["--version"]);

  return environmentSnapshotSchema.parse({
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    safe,
    redacted: [],
    missing: [],
  });
}
