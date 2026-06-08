# CI Failure Pack PRD

## One-Sentence Product Definition

CI Failure Pack is a GitHub Action and local CLI that captures the evidence from a failed CI run, explains the most likely cause in the pull request, and gives the developer a replay path on their machine.

## Problem

CI failures waste time because the useful facts are scattered across logs, runner state, test reports, cache output, environment differences, and git context. A developer sees "CI failed", opens a long log, guesses at the failed command, checks whether the failure reproduces locally, and often discovers the runner had a different runtime, a missing environment variable, a cold cache, or a flaky test. That loop is the "works on my machine" tax. Industry estimates commonly place roughly 26% of developer time on reproducing and diagnosing failing tests, or about 620M developer hours per year at global scale. CI Failure Pack turns that failure moment into a black box recorder: capture once, summarize in the PR, replay locally.

## Target Users

- Individual developers who want fast answers without learning CI internals.
- Small teams that cannot justify a full observability platform for tests.
- Open-source maintainers who review many contributor pull requests.
- Teams with mixed stacks where Node, Python, Go, Rust, and container builds fail in different ways.

## Personas

### Persona A: Open-Source Maintainer

Mira maintains a popular TypeScript library. She reviews pull requests from contributors across time zones. CI failures are frequent because contributors use different Node versions and package managers. Mira does not want to become every contributor's remote debugger. She needs a PR comment that says which test failed, whether the PR touched related files, and which command the contributor should run next.

Primary needs:
- Works on public forks with minimum permissions.
- Does not leak secrets into PR comments or artifacts.
- Updates one comment instead of spamming the thread.
- Makes failures understandable to first-time contributors.

### Persona B: Backend Engineer on a Team

Devon works on a backend service where CI fails multiple times per day. Failures come from integration tests, database URLs, cache misses, and language version drift. Devon can read CI logs, but the time cost is the problem. He needs the first 10 seconds after a failure to reveal the likely cause and the exact failing command.

Primary needs:
- Captures runtime, cache, git, and test output automatically.
- Flags missing environment variables and version mismatches.
- Keeps PR comments brief by default.
- Provides a CLI path for local reproduction.

### Persona C: Solo Developer

Ana is shipping a side project and copied a GitHub Actions workflow from a blog. When CI fails, she does not know where to look. She wants an install that is one YAML block, no dashboard, no account, no tokens beyond the built-in `GITHUB_TOKEN`, and no configuration ceremony.

Primary needs:
- Zero-config defaults.
- Clear errors that explain what to do next.
- Human-readable CLI output instead of raw JSON.
- No secret setup for basic use.

## User Stories

1. As an OSS maintainer, I want one PR comment per failed run so that reviewers are not spammed.
2. As an OSS maintainer, I want secret values redacted so that public forks remain safe.
3. As an OSS maintainer, I want flaky failures labeled so that contributors are not blamed for existing problems.
4. As a backend engineer, I want failed test names extracted so that I avoid searching logs.
5. As a backend engineer, I want the failed command captured so that I can rerun exactly what CI ran.
6. As a backend engineer, I want Node, Python, Go, and Rust versions compared so that runtime drift is obvious.
7. As a backend engineer, I want lockfile and cache state included so that dependency failures are explainable.
8. As a solo developer, I want a copy-paste YAML install so that I can add the tool in under two minutes.
9. As a solo developer, I want `npx ci-failure-pack inspect` to summarize a bundle so that I do not need to understand ZIP internals.
10. As a developer, I want `replay --dry-run` so that I can inspect commands before they execute.
11. As a security-conscious maintainer, I want no raw secrets in bundles so that artifacts are safe to download.
12. As a reviewer, I want comments to be scannable in under 10 seconds so that I can triage without context switching.
13. As a test owner, I want history for a test so that recurring failures can be addressed.
14. As a polyglot team member, I want parsers for common test outputs so that the tool works outside JavaScript.
15. As a CI maintainer, I want action failures to degrade gracefully so that the diagnostic tool never hides the original CI failure.
16. As a contributor, I want instructions that say what went wrong and what to do so that I can fix my PR independently.
17. As a release engineer, I want conventional commits and semantic release so that publishing is predictable.

## Core Features and Priority

### P0

- Zero-config composite GitHub Action.
- Environment capture with redaction.
- Test output parsing for JUnit, JSON, TAP, Playwright, Go, and Rust.
- Git context capture.
- Failed command capture.
- ZIP bundle with validated manifest.
- Brief PR comment.
- CLI `inspect`, `diff`, and `replay --dry-run`.
- Reproduction command generation.

### P1

- Causality scoring.
- Changed file correlation.
- Cache state reporting.
- Local environment capture.
- Flaky detection with history.
- Config loading through `.ci-failure-pack.yml`.

### P2

- Lint and typecheck failure parsing.
- Docker build failure parsing.
- Auto-open issue for newly detected flaky tests.
- Full release automation and npm publishing.

## Success Metrics

- GitHub stars: 1,000 stars from organic PR visibility.
- Repository installs: 500 repos using the action within the first public cycle.
- MTTR reduction: median failed-CI diagnosis time reduced from 20 minutes to under 5 minutes.
- Comment engagement: PR comments clicked or artifact downloaded on at least 25% of failed PRs.
- Replay effectiveness: `replay --dry-run` produces usable commands for 80% of supported fixture projects.

## Non-Goals

- CI Failure Pack is not a full CI observability platform.
- It is not a general log viewer.
- It is not a test runner.
- It does not replace GitHub Actions artifacts, checks, or annotations.
- It does not require a hosted dashboard.
- It does not collect telemetry by default.

## What Makes This Spread

The PR comment is visible to every developer on a failed pull request. It is the product surface and the distribution loop. A comment that says "this failed because CI is using Node 22 while the repo pins Node 20; run this command" sells itself. The default experience must be brief, accurate, and actionable.

## Default Developer Journey

1. Add the action after test steps with `if: failure()`.
2. A CI failure produces `failure-pack.zip` and a short PR comment.
3. Developer downloads the artifact and runs `npx ci-failure-pack inspect failure-pack.zip`.
4. Developer runs `npx ci-failure-pack replay failure-pack.zip --dry-run` before executing the fix path.

## Product Principles

- Evidence before opinion: every cause must map to captured facts.
- Brief by default: comments show the top signal, not a log dump.
- No secrets: redaction is conservative and irreversible.
- Local-first: the artifact and CLI must work without a service.
- Degrade gracefully: missing test reports or git state should produce partial value, not a failed action.
