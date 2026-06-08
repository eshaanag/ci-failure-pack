import { z } from "zod";

import { SCHEMA_VERSION } from "../types/index.js";

const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const isoDateTime = z.string().datetime();

export const captureErrorSchema = z.object({
  module: z.string().min(1),
  severity: z.enum(["warning", "error"]),
  message: z.string().min(1),
  recovery: z.string().min(1),
});

export const repositoryMetadataSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  defaultBranch: z.string().min(1),
  pullRequestNumber: positiveInteger.optional(),
});

export const workflowMetadataSchema = z.object({
  runId: z.string().min(1),
  runAttempt: positiveInteger,
  workflowName: z.string().min(1),
  jobName: z.string().min(1),
  runnerOs: z.string().min(1),
  eventName: z.string().min(1),
});

export const bundleFileEntrySchema = z.object({
  path: z.string().min(1),
  mediaType: z.string().min(1),
  required: z.boolean(),
  sizeBytes: nonNegativeInteger,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const bundleManifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  bundleId: z.string().uuid(),
  capturedAt: isoDateTime,
  toolVersion: z.string().min(1),
  source: z.enum(["github-actions", "local-fixture"]),
  repository: repositoryMetadataSchema,
  workflow: workflowMetadataSchema,
  files: z.array(bundleFileEntrySchema),
  errors: z.array(captureErrorSchema),
});

export const bundleMetadataSchema = z.object({
  generatedBy: z.literal("ci-failure-pack"),
  actionVersion: z.string().min(1),
  nodeVersion: z.string().min(1),
  platform: z.string().min(1),
});

export const environmentVariableSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  source: z.enum(["process", "detected", "config"]),
});

export const redactedEnvironmentVariableSchema = z.object({
  name: z.string().min(1),
  marker: z.string().min(1),
  reason: z.enum(["name", "config", "entropy", "github-mask"]),
});

export const missingEnvironmentVariableSchema = z.object({
  name: z.string().min(1),
  expectedBecause: z.string().min(1),
});

export const environmentSnapshotSchema = z.object({
  capturedAt: isoDateTime,
  safe: z.array(environmentVariableSchema),
  redacted: z.array(redactedEnvironmentVariableSchema),
  missing: z.array(missingEnvironmentVariableSchema),
});

export const testResultSchema = z.object({
  name: z.string().min(1),
  suite: z.string().optional(),
  file: z.string().optional(),
  status: z.enum(["passed", "failed", "skipped"]),
  durationMs: z.number().nonnegative().optional(),
});

export const testFailureSchema = z.object({
  name: z.string().min(1),
  suite: z.string().optional(),
  file: z.string().optional(),
  line: positiveInteger.optional(),
  assertion: z.string().optional(),
  stack: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
});

export const parserErrorSchema = z.object({
  message: z.string().min(1),
  recovery: z.string().min(1),
});

export const testOutputFormatSchema = z.enum([
  "junit",
  "jest-json",
  "tap",
  "playwright-json",
  "go-test",
  "rust-test",
  "eslint-json",
  "tsc",
  "docker-build",
  "unknown",
]);

export const parsedTestOutputSchema = z.object({
  format: testOutputFormatSchema,
  total: nonNegativeInteger,
  passed: nonNegativeInteger,
  skipped: nonNegativeInteger,
  failed: z.array(testFailureSchema),
  durationMs: z.number().nonnegative(),
  parserErrors: z.array(parserErrorSchema),
});

export const gitContextSchema = z.object({
  sha: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  commitMessage: z.string().optional(),
  isPullRequest: z.boolean(),
  changedFiles: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
});

export const failedCommandSchema = z.object({
  stepName: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  exitCode: z.number().int().optional(),
  logTail: z.string(),
  truncated: z.boolean(),
});

export const causalityScoreSchema = z.object({
  signal: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().nonnegative(),
  percentage: z.number().min(0).max(100),
  evidence: z.string().min(1),
});

export const flakeFailureOccurrenceSchema = z.object({
  commitSha: z.string().min(1),
  runId: z.string().min(1),
  failedAt: isoDateTime,
  relatedFilesChanged: z.boolean(),
});

export const flakeRecordSchema = z.object({
  testName: z.string().min(1),
  file: z.string().optional(),
  failures: z.array(flakeFailureOccurrenceSchema),
  classification: z.enum(["flaky", "broken", "unknown"]),
});

export const failureHistorySchema = z.object({
  repository: z.string().min(1),
  records: z.array(flakeRecordSchema),
  updatedAt: isoDateTime,
});

export const reproductionStepSchema = z.object({
  command: z.string().min(1),
  reason: z.string().min(1),
  safeToRun: z.boolean(),
});

export const reproductionCommandSchema = z.object({
  projectType: z.enum(["node", "python", "go", "rust", "unknown"]),
  summary: z.string().min(1),
  commands: z.array(reproductionStepSchema),
});

export const cacheEntrySchema = z.object({
  name: z.string().min(1),
  key: z.string(),
  hit: z.boolean(),
  source: z.enum(["actions-cache", "env", "unknown"]),
});

export const packageChangeSchema = z.object({
  name: z.string().min(1),
  changeType: z.enum(["added", "removed", "upgraded", "downgraded"]),
  fromVersion: z.string().optional(),
  toVersion: z.string().optional(),
});

export const cacheStateSchema = z.object({
  caches: z.array(cacheEntrySchema),
  lockfileChanged: z.boolean(),
  packageChanges: z.array(packageChangeSchema),
});

export const changedFileCorrelationSchema = z.object({
  classification: z.enum(["direct", "indirect", "none", "unknown"]),
  failingFile: z.string().optional(),
  changedFile: z.string().optional(),
  explanation: z.string().min(1),
});

export const failureBundleSchema = z.object({
  manifest: bundleManifestSchema,
  metadata: bundleMetadataSchema,
  environment: environmentSnapshotSchema,
  testOutput: parsedTestOutputSchema,
  gitContext: gitContextSchema,
  failedCommand: failedCommandSchema,
  cacheState: cacheStateSchema.optional(),
  causality: z.array(causalityScoreSchema),
  reproduction: reproductionCommandSchema,
  history: failureHistorySchema.optional(),
});

export const actionInputsSchema = z.object({
  failedStepName: z.string().min(1).optional(),
  failedCommand: z.string().min(1).optional(),
  exitCode: z.number().int().optional(),
  logTail: z.string().optional(),
  logTailLines: positiveInteger.max(10_000).default(200),
  commentVerbosity: z.enum(["brief", "standard", "full"]).default("brief"),
  bundleName: z.string().min(1).default("failure-pack.zip"),
  configPath: z.string().min(1).optional(),
});

export const causalityWeightsSchema = z.object({
  lockfileChanged: z.number().nonnegative().default(90),
  runtimeVersionMismatch: z.number().nonnegative().default(85),
  missingEnvVar: z.number().nonnegative().default(80),
  cacheMissAfterLockfile: z.number().nonnegative().default(65),
  testFileChanged: z.number().nonnegative().default(55),
  flakyHistory: z.number().nonnegative().default(40),
  networkDependentTest: z.number().nonnegative().default(20),
  runnerResourcePressure: z.number().nonnegative().default(10),
});

export const failurePackConfigSchema = z.object({
  commentVerbosity: z.enum(["brief", "standard", "full"]).default("brief"),
  bundleName: z.string().min(1).default("failure-pack.zip"),
  logTailLines: positiveInteger.max(10_000).default(200),
  flakyDetection: z.boolean().default(true),
  autoOpenFlakyIssue: z.boolean().default(false),
  sensitiveEnvVars: z.array(z.string().min(1)).default([]),
  artifactGlobs: z.array(z.string().min(1)).default([]),
  causalityWeights: causalityWeightsSchema.default({}),
});

export type ValidatedFailureBundle = z.infer<typeof failureBundleSchema>;
export type ValidatedActionInputs = z.infer<typeof actionInputsSchema>;
export type ValidatedFailurePackConfig = z.infer<typeof failurePackConfigSchema>;
