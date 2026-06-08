export const SCHEMA_VERSION = "1.0.0";

export type RedactionReason = "name" | "config" | "entropy" | "github-mask";
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type TestOutputFormat =
  | "junit"
  | "jest-json"
  | "tap"
  | "playwright-json"
  | "go-test"
  | "rust-test"
  | "eslint-json"
  | "tsc"
  | "docker-build"
  | "unknown";

export interface FailureBundle {
  manifest: BundleManifest;
  metadata: BundleMetadata;
  environment: EnvironmentSnapshot;
  testOutput: ParsedTestOutput;
  gitContext: GitContext;
  failedCommand: FailedCommand;
  cacheState?: CacheState;
  causality: CausalityScore[];
  reproduction: ReproductionCommand;
  history?: FailureHistory;
}

export interface BundleManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  bundleId: string;
  capturedAt: string;
  toolVersion: string;
  source: "github-actions" | "local-fixture";
  repository: RepositoryMetadata;
  workflow: WorkflowMetadata;
  files: BundleFileEntry[];
  errors: CaptureError[];
}

export interface BundleMetadata {
  generatedBy: "ci-failure-pack";
  actionVersion: string;
  nodeVersion: string;
  platform: string;
}

export interface RepositoryMetadata {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  pullRequestNumber?: number | undefined;
}

export interface WorkflowMetadata {
  runId: string;
  runAttempt: number;
  workflowName: string;
  jobName: string;
  runnerOs: string;
  eventName: string;
}

export interface BundleFileEntry {
  path: string;
  mediaType: string;
  required: boolean;
  sizeBytes: number;
  sha256: string;
}

export interface CaptureError {
  module: string;
  severity: "warning" | "error";
  message: string;
  recovery: string;
}

export interface EnvironmentSnapshot {
  capturedAt: string;
  safe: EnvironmentVariable[];
  redacted: RedactedEnvironmentVariable[];
  missing: MissingEnvironmentVariable[];
}

export interface EnvironmentVariable {
  name: string;
  value: string;
  source: "process" | "detected" | "config";
}

export interface RedactedEnvironmentVariable {
  name: string;
  marker: string;
  reason: RedactionReason;
}

export interface MissingEnvironmentVariable {
  name: string;
  expectedBecause: string;
}

export interface ParsedTestOutput {
  format: TestOutputFormat;
  total: number;
  passed: number;
  skipped: number;
  failed: TestFailure[];
  durationMs: number;
  parserErrors: ParserError[];
}

export interface TestResult {
  name: string;
  suite?: string;
  file?: string;
  status: "passed" | "failed" | "skipped";
  durationMs?: number;
}

export interface TestFailure {
  name: string;
  suite?: string;
  file?: string;
  line?: number;
  assertion?: string;
  stack?: string;
  durationMs?: number;
}

export interface ParserError {
  message: string;
  recovery: string;
}

export interface GitContext {
  sha?: string | undefined;
  branch?: string | undefined;
  baseBranch?: string | undefined;
  commitMessage?: string | undefined;
  isPullRequest: boolean;
  changedFiles: string[];
  warnings: string[];
}

export interface FailedCommand {
  stepName?: string | undefined;
  command?: string | undefined;
  exitCode?: number | undefined;
  logTail: string;
  truncated: boolean;
}

export interface CausalityScore {
  signal: string;
  label: string;
  weight: number;
  percentage: number;
  evidence: string;
}

export interface FlakeRecord {
  testName: string;
  file?: string;
  failures: FlakeFailureOccurrence[];
  classification: "flaky" | "broken" | "unknown";
}

export interface FlakeFailureOccurrence {
  commitSha: string;
  runId: string;
  failedAt: string;
  relatedFilesChanged: boolean;
}

export interface FailureHistory {
  repository: string;
  records: FlakeRecord[];
  updatedAt: string;
}

export interface ReproductionCommand {
  projectType: "node" | "python" | "go" | "rust" | "unknown";
  summary: string;
  commands: ReproductionStep[];
}

export interface ReproductionStep {
  command: string;
  reason: string;
  safeToRun: boolean;
}

export interface CacheState {
  caches: CacheEntry[];
  lockfileChanged: boolean;
  packageChanges: PackageChange[];
}

export interface CacheEntry {
  name: string;
  key: string;
  hit: boolean;
  source: "actions-cache" | "env" | "unknown";
}

export interface PackageChange {
  name: string;
  changeType: "added" | "removed" | "upgraded" | "downgraded";
  fromVersion?: string;
  toVersion?: string;
}

export interface ChangedFileCorrelation {
  classification: "direct" | "indirect" | "none" | "unknown";
  failingFile?: string | undefined;
  changedFile?: string | undefined;
  explanation: string;
}

export interface ActionInputs {
  failedStepName?: string;
  failedCommand?: string;
  exitCode?: number;
  logTail?: string;
  logTailLines: number;
  commentVerbosity: CommentVerbosity;
  bundleName: string;
  configPath?: string;
}

export type CommentVerbosity = "brief" | "standard" | "full";

export interface CausalityWeights {
  lockfileChanged: number;
  runtimeVersionMismatch: number;
  missingEnvVar: number;
  cacheMissAfterLockfile: number;
  testFileChanged: number;
  flakyHistory: number;
  networkDependentTest: number;
  runnerResourcePressure: number;
}

export interface FailurePackConfig {
  commentVerbosity: CommentVerbosity;
  bundleName: string;
  logTailLines: number;
  flakyDetection: boolean;
  autoOpenFlakyIssue: boolean;
  sensitiveEnvVars: string[];
  artifactGlobs: string[];
  causalityWeights: CausalityWeights;
}

export interface LoggerFields {
  [key: string]: boolean | number | string | undefined;
}

export interface Logger {
  debug(message: string, fields?: LoggerFields): void;
  info(message: string, fields?: LoggerFields): void;
  warn(message: string, fields?: LoggerFields): void;
  error(message: string, fields?: LoggerFields): void;
}
