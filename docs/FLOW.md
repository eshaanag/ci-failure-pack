# CI Failure Pack Feature Flows

## End-to-End Flow

```text
CI job fails
  |
  v
workflow reaches CI Failure Pack step with if: failure()
  |
  v
action captures env + tests + git + command + cache
  |
  v
action validates bundle files with Zod schemas
  |
  v
failure-pack.zip uploaded as artifact
  |
  v
if pull request and token allows comments
  |
  v
brief PR comment posted or updated
  |
  v
developer downloads artifact
  |
  v
npx ci-failure-pack inspect failure-pack.zip
  |
  v
npx ci-failure-pack replay failure-pack.zip --dry-run
  |
  v
developer fixes and pushes
```

## Environment Diff Flow

```text
capture CI environment
  |
  v
redact names and values
  |
  v
write env.json with safe/redacted/missing groups
  |
  v
developer runs capture-local or diff
  |
  v
CLI detects local runtime and selected env vars
  |
  v
compare CI vs local
  |
  v
render match, mismatch, missing, and redacted states
```

Secret variables are displayed by name only. Values are never compared or printed.

## Flaky Detection Flow

```text
failed tests parsed
  |
  v
history loaded from cache
  |
  v
for each failed test:
  |
  +--> count prior failures
  |
  +--> check commit diversity
  |
  +--> check related file changes
  |
  v
classify flaky, broken, or unknown
  |
  v
write updated history
  |
  v
show badge in PR comment
```

## Causality Scoring Flow

```text
collect evidence
  |
  v
evaluate signal: lockfile_changed
  |
  v
evaluate signal: runtime_version_mismatch
  |
  v
evaluate signal: missing_env_var
  |
  v
evaluate signal: cache_miss_after_lockfile
  |
  v
evaluate signal: test_file_changed
  |
  v
evaluate remaining low-weight signals
  |
  v
normalize triggered weights to percentages
  |
  v
select top 3
  |
  v
render top cause in brief comment
```

## Reproduction Command Flow

```text
read bundle
  |
  v
validate manifest, env, tests, git, command
  |
  v
detect project type from bundle artifacts and repo files
  |
  +--> Node: version file -> package manager -> install -> test command
  +--> Python: version file -> dependency file -> install -> test command
  +--> Go: go.mod -> go mod download -> go test command
  +--> Rust: Cargo.toml -> rustup override -> cargo test command
  +--> Unknown: show captured command and inspection steps
  |
  v
render shell block with comments
```

## PR Comment Flow

```text
format comment from analysis result
  |
  v
if not pull request
  |
  +--> log "comment skipped: not a pull request"
  |
  v
if pull request
  |
  v
list existing issue comments
  |
  +--> marker exists: PATCH existing comment
  |
  +--> marker absent: POST new comment
  |
  v
if GitHub API fails
  |
  v
log actionable warning and keep action successful
```

## Bundle Packaging Flow

```text
start capture result object
  |
  v
run capture modules independently
  |
  +--> success: attach data
  |
  +--> non-critical failure: record CaptureError
  |
  v
validate required data shapes
  |
  v
write JSON and text files into ZIP
  |
  v
include configured artifact globs under artifacts/
  |
  v
check size budget
  |
  v
emit output path
```

## Error Flows

### Git Not Found

```text
git command fails ENOENT
  |
  v
logger.warn with installation/context message
  |
  v
return GitContext from env variables only
```

### No Test Report

```text
search configured globs and defaults
  |
  v
no files found
  |
  v
test-output.json contains zero tests and parser warning
  |
  v
PR comment uses failed command and log tail instead of test names
```

### Bundle Malformed

```text
CLI opens ZIP
  |
  v
required file missing or JSON invalid
  |
  v
show field-level validation error
  |
  v
suggest re-downloading artifact
```

### GitHub Token Invalid

```text
poster receives 401 or 403
  |
  v
log permission-specific warning
  |
  v
do not fail diagnostic action
```

### PR Not Found

```text
event is push, schedule, or workflow_dispatch
  |
  v
skip PR comment
  |
  v
still upload artifact and finish
```

### Replay Dirty Working Tree

```text
CLI checks git status
  |
  v
dirty tree detected
  |
  v
show changed files count
  |
  v
ask for confirmation before checkout
  |
  +--> no: stop before changes
  |
  +--> yes: checkout captured commit
```
