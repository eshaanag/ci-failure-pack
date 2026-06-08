# CI Failure Pack TRD

## Architecture Overview

CI Failure Pack has two runtime surfaces:

```text
GitHub Actions failure
  -> composite action shell wrapper
  -> Node 20 action scripts
  -> capture modules
  -> validated ZIP bundle
  -> artifact upload
  -> optional PR comment

Developer laptop
  -> Node 20+ CLI
  -> ZIP reader and Zod validation
  -> inspect, diff, replay, history, open
```

The action and CLI share types, schemas, parsers, and reproduction logic through `packages/shared`.

## Action Execution Environment

GitHub-hosted Ubuntu runners provide Node.js 20, bash, git, and standard POSIX tools. The action must assume:

- Shallow checkout may omit merge-base history.
- Forked pull requests may have restricted token permissions.
- Step logs are not fully available unless passed or captured by workflow configuration.
- Artifacts and cache APIs can fail independently of the original job.
- Environment variables may contain masked or sensitive values.
- The diagnostic action must complete in under 30 seconds for normal projects.

## Bundle Format

The bundle is a ZIP file named `failure-pack.zip` by default. Required entries:

- `manifest.json`: summary and schema version.
- `metadata.json`: run, repository, job, and capture metadata.
- `env.json`: redacted environment snapshot.
- `test-output.json`: normalized test results.
- `git-context.json`: commit and changed-file context.
- `log.txt`: log tail or failed command output.

Optional entries:

- `junit.xml`: original report if discovered.
- `cache-state.json`: cache hit/miss information.
- `history.json`: flaky detection history snapshot.
- `artifacts/**`: user-configured diagnostic files.

## Manifest Interfaces

```ts
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
```

## Environment Capture Strategy

Captured variables are split into:

- `safe`: name and value are safe to render.
- `redacted`: name is preserved, value is replaced with `[REDACTED:name]`, `[REDACTED:entropy]`, `[REDACTED:config]`, or `[REDACTED:github-mask]`.
- `missing`: expected safe variables not present in CI.

Redaction order:

1. Name patterns: `*_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, `*_CREDENTIALS`, `*_DSN`, `DATABASE_URL`, `*_API*`.
2. Configured `sensitive_env_vars`.
3. High entropy values above threshold.
4. GitHub Actions mask markers.

Safe allowlist exceptions include public build metadata such as `CI`, `NODE_ENV`, `RUNNER_OS`, `GITHUB_REF`, `GITHUB_SHA`, `VITE_PUBLIC_URL`, and `NEXT_PUBLIC_*`.

## Test Output Parsers

All parsers return:

```ts
export interface ParsedTestOutput {
  format: TestOutputFormat;
  total: number;
  passed: number;
  failed: TestFailure[];
  skipped: number;
  durationMs: number;
  parserErrors: ParserError[];
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
```

Supported formats:

- JUnit XML: `<testsuite>` and `<testcase>` nodes with `<failure>` or `<error>`.
- Jest/Vitest JSON: `testResults[].assertionResults[]`.
- TAP: `not ok` lines with YAML diagnostics when present.
- Playwright JSON: suites/specs/tests/results with error messages and attachments.
- pytest: primarily JUnit XML and short terminal fallback.
- Go: `go test -json` preferred, `go test -v` text fallback.
- Rust: `cargo test` text output with failed test list.
- RSpec: JUnit XML or JSON when configured.

Malformed input produces a partial result with `parserErrors`; it does not throw to callers.

## Causality Scoring

Each signal returns either zero or a configured weight. Triggered weights are normalized into percentages.

| Signal | Weight | Evidence |
| --- | ---: | --- |
| `lockfile_changed` | 90 | PR changed lockfile |
| `runtime_version_mismatch` | 85 | CI runtime differs from repo version file |
| `missing_env_var` | 80 | test references env var missing in CI |
| `cache_miss_after_lockfile` | 65 | cache miss and lockfile changed |
| `test_file_changed` | 55 | failing test file changed |
| `flaky_history` | 40 | failure history without related changes |
| `network_dependent_test` | 20 | test name suggests network dependency |
| `runner_resource_pressure` | 10 | job duration exceeds median by 3x |

If no signal triggers, the top cause is `unknown` with guidance to inspect the log tail.

## Flaky Detection

History record:

```ts
export interface FlakeRecord {
  testName: string;
  file?: string;
  failures: FlakeFailureOccurrence[];
}

export interface FlakeFailureOccurrence {
  commitSha: string;
  runId: string;
  failedAt: string;
  relatedFilesChanged: boolean;
}
```

Classification:

- `flaky`: 3 or more failures across different commits without related changes.
- `broken`: first or repeated failure on a commit that touched the test or direct imports.
- `unknown`: insufficient history or mixed evidence.

History is stored through GitHub Actions Cache using key `ci-failure-pack-history-{owner}-{repo}`.

## Reproduction Command Generation

Detection tree:

1. Node: `package.json`, lockfiles, `.nvmrc`, `.node-version`, `.tool-versions`.
2. Python: `pyproject.toml`, `requirements.txt`, `Pipfile`, `.python-version`.
3. Go: `go.mod`, captured `go version`.
4. Rust: `Cargo.toml`, captured `rustc` or toolchain file.
5. Fallback: print captured failed command and environment diff instructions.

The output is a shell block with comments explaining each step. The CLI never executes arbitrary commands from optional artifact files.

## CLI Architecture

Commander commands:

- `inspect <bundle>`: validate and summarize.
- `diff <bundle>`: compare CI bundle against local runtime and env.
- `capture-local`: write `.ci-failure-pack-local.json`.
- `replay <bundle>`: run guarded reproduction flow.
- `history <bundle-or-name>`: show timeline for a test.
- `open <bundle>`: extract and open bundled HTML reports when present.

Every command validates inputs with Zod and reports user-facing errors without stack traces unless `LOG_LEVEL=debug`.

## GitHub API Usage

- Post comment: `POST /repos/{owner}/{repo}/issues/{pr}/comments`.
- Update comment: `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`.
- List comments to find the marker: `GET /repos/{owner}/{repo}/issues/{pr}/comments`.
- Optional issue creation for new flaky tests.

Minimum permissions:

```yaml
permissions:
  contents: read
  actions: read
  pull-requests: write
  issues: write # only when auto-open flaky issue is enabled
```

## Performance Requirements

- Action capture path completes in under 30 seconds for typical projects.
- Bundle size target is under 50 MB.
- CLI `inspect` starts rendering within 2 seconds for normal bundles.
- CLI `replay` starts the failing test within 60 seconds after confirmations and install.

## Security

- Secret values are never written to bundle files or comments.
- Redaction is conservative; false positives are acceptable.
- Bundle schemas reject unknown critical shapes but allow forward-compatible optional fields.
- `GITHUB_TOKEN` is used only when available and only for GitHub API calls.
- CLI replay asks before checkout when the working tree is dirty.
- The bundle is data, not code. Replay executes generated commands from known project metadata and the captured failed command only after validation.
