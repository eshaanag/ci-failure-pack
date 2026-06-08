# CI Failure Pack Schemas and Bundle Format

## Bundle ZIP Structure

```text
failure-pack.zip
├── manifest.json
├── metadata.json
├── env.json
├── test-output.json
├── git-context.json
├── log.txt
├── cache-state.json            optional
├── history.json                optional
├── junit.xml                   optional original report
└── artifacts/                  optional configured files
```

## TypeScript Interfaces

```ts
export type RedactionReason = "name" | "config" | "entropy" | "github-mask";
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
  schemaVersion: "1.0.0";
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
  pullRequestNumber?: number;
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
  sha?: string;
  branch?: string;
  baseBranch?: string;
  commitMessage?: string;
  isPullRequest: boolean;
  changedFiles: string[];
  warnings: string[];
}

export interface FailedCommand {
  stepName?: string;
  command?: string;
  exitCode?: number;
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
  failingFile?: string;
  changedFile?: string;
  explanation: string;
}
```

## Zod Schemas

Implementation schemas mirror the interfaces. Representative complete schema shape:

```ts
import { z } from "zod";

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
  pullRequestNumber: z.number().int().positive().optional(),
});

export const workflowMetadataSchema = z.object({
  runId: z.string().min(1),
  runAttempt: z.number().int().positive(),
  workflowName: z.string().min(1),
  jobName: z.string().min(1),
  runnerOs: z.string().min(1),
  eventName: z.string().min(1),
});

export const bundleFileEntrySchema = z.object({
  path: z.string().min(1),
  mediaType: z.string().min(1),
  required: z.boolean(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const bundleManifestSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  bundleId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  toolVersion: z.string().min(1),
  source: z.enum(["github-actions", "local-fixture"]),
  repository: repositoryMetadataSchema,
  workflow: workflowMetadataSchema,
  files: z.array(bundleFileEntrySchema),
  errors: z.array(captureErrorSchema),
});

export const environmentSnapshotSchema = z.object({
  capturedAt: z.string().datetime(),
  safe: z.array(
    z.object({
      name: z.string().min(1),
      value: z.string(),
      source: z.enum(["process", "detected", "config"]),
    }),
  ),
  redacted: z.array(
    z.object({
      name: z.string().min(1),
      marker: z.string().min(1),
      reason: z.enum(["name", "config", "entropy", "github-mask"]),
    }),
  ),
  missing: z.array(
    z.object({
      name: z.string().min(1),
      expectedBecause: z.string().min(1),
    }),
  ),
});

export const testFailureSchema = z.object({
  name: z.string().min(1),
  suite: z.string().optional(),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  assertion: z.string().optional(),
  stack: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
});

export const parsedTestOutputSchema = z.object({
  format: z.enum([
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
  ]),
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.array(testFailureSchema),
  durationMs: z.number().nonnegative(),
  parserErrors: z.array(
    z.object({
      message: z.string().min(1),
      recovery: z.string().min(1),
    }),
  ),
});
```

The implementation exports schemas for every interface, including `FailureBundle`, `GitContext`, `FailedCommand`, `CausalityScore`, `FlakeRecord`, `ReproductionCommand`, `CacheState`, and `ChangedFileCorrelation`.

## manifest.json Fields

| Field           | Type         | Description                                 |
| --------------- | ------------ | ------------------------------------------- |
| `schemaVersion` | string       | Bundle schema version.                      |
| `bundleId`      | UUID         | Unique bundle identifier.                   |
| `capturedAt`    | ISO datetime | Capture time.                               |
| `toolVersion`   | string       | CI Failure Pack version.                    |
| `source`        | enum         | `github-actions` or `local-fixture`.        |
| `repository`    | object       | Owner, repo, default branch, PR number.     |
| `workflow`      | object       | Run, attempt, workflow, job, runner, event. |
| `files`         | array        | ZIP file index with hashes.                 |
| `errors`        | array        | Non-critical capture errors.                |

## env.json

```json
{
  "capturedAt": "2026-06-08T00:00:00.000Z",
  "safe": [{ "name": "CI", "value": "true", "source": "process" }],
  "redacted": [{ "name": "GITHUB_TOKEN", "marker": "[REDACTED:name]", "reason": "name" }],
  "missing": [{ "name": "NODE_ENV", "expectedBecause": "common test environment variable" }]
}
```

## test-output.json

Normalized across all parser inputs:

```json
{
  "format": "junit",
  "total": 12,
  "passed": 10,
  "skipped": 0,
  "failed": [
    {
      "name": "UserService creates users",
      "suite": "UserService",
      "file": "tests/user.test.ts",
      "line": 42,
      "assertion": "expected 201, got 500",
      "durationMs": 31
    }
  ],
  "durationMs": 981,
  "parserErrors": []
}
```

## history.json

```json
{
  "repository": "owner/repo",
  "updatedAt": "2026-06-08T00:00:00.000Z",
  "records": [
    {
      "testName": "Button renders",
      "file": "src/Button.test.tsx",
      "classification": "flaky",
      "failures": [
        {
          "commitSha": "abc123",
          "runId": "182901",
          "failedAt": "2026-06-08T00:00:00.000Z",
          "relatedFilesChanged": false
        }
      ]
    }
  ]
}
```

Cache key scheme:

```text
ci-failure-pack-history-{owner}-{repo}
ci-failure-pack-history-{owner}-{repo}-{defaultBranch}
```

## Manual Inspection Contract

A developer who manually unzips the bundle should see valid JSON, clear file names, and no secret values. Redacted variables preserve enough information to debug presence and absence while never storing the original value.
