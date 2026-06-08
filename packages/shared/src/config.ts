import { cosmiconfig } from "cosmiconfig";
import { z } from "zod";

import { failurePackConfigSchema } from "./schemas/index.js";
import type { CausalityWeights, FailurePackConfig } from "./types/index.js";

export interface LoadedFailurePackConfig {
  config: FailurePackConfig;
  filepath?: string | undefined;
  warnings: string[];
}

export interface ConfigSearchResult {
  filepath: string;
  config: unknown;
  isEmpty?: boolean;
}

export interface ConfigExplorer {
  search(cwd?: string): Promise<ConfigSearchResult | null>;
}

export interface LoadConfigOptions {
  cwd?: string;
  explorer?: ConfigExplorer;
}

const topLevelKeys = {
  comment_verbosity: "commentVerbosity",
  commentVerbosity: "commentVerbosity",
  bundle_name: "bundleName",
  bundleName: "bundleName",
  log_tail_lines: "logTailLines",
  logTailLines: "logTailLines",
  flaky_detection: "flakyDetection",
  flakyDetection: "flakyDetection",
  auto_open_flaky_issue: "autoOpenFlakyIssue",
  autoOpenFlakyIssue: "autoOpenFlakyIssue",
  sensitive_env_vars: "sensitiveEnvVars",
  sensitiveEnvVars: "sensitiveEnvVars",
  artifact_globs: "artifactGlobs",
  artifactGlobs: "artifactGlobs",
  causality_weights: "causalityWeights",
  causalityWeights: "causalityWeights",
} as const;

const weightKeys = {
  lockfile_changed: "lockfileChanged",
  lockfileChanged: "lockfileChanged",
  runtime_version_mismatch: "runtimeVersionMismatch",
  runtimeVersionMismatch: "runtimeVersionMismatch",
  missing_env_var: "missingEnvVar",
  missingEnvVar: "missingEnvVar",
  cache_miss_after_lockfile: "cacheMissAfterLockfile",
  cacheMissAfterLockfile: "cacheMissAfterLockfile",
  test_file_changed: "testFileChanged",
  testFileChanged: "testFileChanged",
  flaky_history: "flakyHistory",
  flakyHistory: "flakyHistory",
  network_dependent_test: "networkDependentTest",
  networkDependentTest: "networkDependentTest",
  runner_resource_pressure: "runnerResourcePressure",
  runnerResourcePressure: "runnerResourcePressure",
} as const;

type ConfigKey = (typeof topLevelKeys)[keyof typeof topLevelKeys];
type WeightKey = (typeof weightKeys)[keyof typeof weightKeys];

const commentVerbositySchema = z.enum(["brief", "standard", "full"]);
const stringArraySchema = z.array(z.string().min(1));
const nonNegativeNumberSchema = z.number().nonnegative();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultConfig(): FailurePackConfig {
  return failurePackConfigSchema.parse({});
}

function setConfigValue(
  config: FailurePackConfig,
  key: ConfigKey,
  value: unknown,
  warnings: string[],
): void {
  if (key === "commentVerbosity") {
    const result = commentVerbositySchema.safeParse(value);
    if (result.success) config.commentVerbosity = result.data;
    else warnings.push("Invalid comment_verbosity; using default brief.");
  } else if (key === "bundleName") {
    const result = z.string().min(1).safeParse(value);
    if (result.success) config.bundleName = result.data;
    else warnings.push("Invalid bundle_name; using default failure-pack.zip.");
  } else if (key === "logTailLines") {
    const result = z.number().int().positive().max(10_000).safeParse(value);
    if (result.success) config.logTailLines = result.data;
    else warnings.push("Invalid log_tail_lines; using default 200.");
  } else if (key === "flakyDetection") {
    const result = z.boolean().safeParse(value);
    if (result.success) config.flakyDetection = result.data;
    else warnings.push("Invalid flaky_detection; using default true.");
  } else if (key === "autoOpenFlakyIssue") {
    const result = z.boolean().safeParse(value);
    if (result.success) config.autoOpenFlakyIssue = result.data;
    else warnings.push("Invalid auto_open_flaky_issue; using default false.");
  } else if (key === "sensitiveEnvVars") {
    const result = stringArraySchema.safeParse(value);
    if (result.success) config.sensitiveEnvVars = result.data;
    else warnings.push("Invalid sensitive_env_vars; using default empty list.");
  } else if (key === "artifactGlobs") {
    const result = stringArraySchema.safeParse(value);
    if (result.success) config.artifactGlobs = result.data;
    else warnings.push("Invalid artifact_globs; using default empty list.");
  }
}

function setWeightValue(
  weights: CausalityWeights,
  key: WeightKey,
  value: unknown,
  warnings: string[],
): void {
  const result = nonNegativeNumberSchema.safeParse(value);
  if (result.success) {
    weights[key] = result.data;
  } else {
    warnings.push(`Invalid causality_weights.${key}; using default ${weights[key]}.`);
  }
}

function applyCausalityWeights(
  config: FailurePackConfig,
  value: unknown,
  warnings: string[],
): void {
  if (!isRecord(value)) {
    warnings.push("Invalid causality_weights; using default weights.");
    return;
  }
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const mapped = weightKeys[rawKey as keyof typeof weightKeys];
    if (mapped === undefined) {
      warnings.push(`Unknown causality_weights field ignored: ${rawKey}.`);
      continue;
    }
    setWeightValue(config.causalityWeights, mapped, rawValue, warnings);
  }
}

function normalizeConfig(raw: unknown, warnings: string[]): FailurePackConfig {
  const config = defaultConfig();
  if (!isRecord(raw)) {
    warnings.push("Configuration file must contain an object; using defaults.");
    return config;
  }
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const mapped = topLevelKeys[rawKey as keyof typeof topLevelKeys];
    if (mapped === undefined) {
      warnings.push(`Unknown configuration field ignored: ${rawKey}.`);
      continue;
    }
    if (mapped === "causalityWeights") {
      applyCausalityWeights(config, rawValue, warnings);
    } else {
      setConfigValue(config, mapped, rawValue, warnings);
    }
  }
  return failurePackConfigSchema.parse(config);
}

function createDefaultExplorer(): ConfigExplorer {
  return cosmiconfig("ci-failure-pack", {
    searchPlaces: [".ci-failure-pack.yml", ".ci-failure-pack.yaml", "package.json"],
  });
}

/**
 * Loads and validates CI Failure Pack configuration with safe defaults.
 *
 * @param options - Optional cwd or explorer for tests.
 * @returns Resolved config, optional filepath, and non-fatal warnings.
 */
export async function loadFailurePackConfig(
  options: LoadConfigOptions = {},
): Promise<LoadedFailurePackConfig> {
  const explorer = options.explorer ?? createDefaultExplorer();
  const result = await explorer.search(options.cwd);
  const warnings: string[] = [];
  if (result === null || result.isEmpty === true) {
    return { config: defaultConfig(), warnings };
  }
  return {
    config: normalizeConfig(result.config, warnings),
    filepath: result.filepath,
    warnings,
  };
}
