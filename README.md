# CI Failure Pack

[![npm version](https://img.shields.io/npm/v/ci-failure-pack.svg)](https://www.npmjs.com/package/ci-failure-pack)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![GitHub stars](https://img.shields.io/github/stars/eshaanag/ci-failure-pack?style=social)](https://github.com/eshaanag/ci-failure-pack)

Black box recorder for failed CI runs.

CI failures are expensive because the evidence is scattered: test reports, runner environment, git state, cache hits, failed commands, and log tails all live in different places. CI Failure Pack captures that evidence when the job fails, posts the short version on the PR, and gives the developer a local CLI path to inspect, diff, and replay the failure.

## How It Works

1. Add the action after your test step with `if: failure()`.
2. When CI fails, the action creates `failure-pack.zip` and posts a concise PR comment.
3. Download the artifact and run `npx ci-failure-pack replay failure-pack.zip` locally.

## Quick Start

```yaml
name: CI

on:
  pull_request:
  push:

permissions:
  contents: read
  actions: read
  pull-requests: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - name: Test
        run: pnpm test
      - name: Capture CI failure pack
        if: failure()
        uses: eshaanag/ci-failure-pack@v1
        with:
          failed-step-name: Test
          failed-command: pnpm test
```

No account, dashboard, or extra secret is required for basic use. The built-in `GITHUB_TOKEN` is enough for PR comments when the workflow grants `pull-requests: write`.

## Example PR Comment

```md
❌ test failed in CI
UserService creates users, Billing retries declined cards — 2 assertions failed
⚠ Likely: Node version mismatch (62%)
▶ Reproduce: npx ci-failure-pack replay failure-pack.zip
```

## Features

| Status      | Feature                                                                                 |
| ----------- | --------------------------------------------------------------------------------------- |
| ✅ Complete | Product requirements, technical design, flows, and schema documents                     |
| ✅ Complete | pnpm monorepo foundation, shared interfaces, Zod schemas, action skeleton, CLI skeleton |
| ✅ Complete | Environment capture with secret redaction                                               |
| ✅ Complete | Test output parsing for JUnit, Jest/Vitest JSON, TAP, Playwright, Go, and Rust          |
| ✅ Complete | Git context capture                                                                     |
| ✅ Complete | Failed command capture                                                                  |
| ✅ Complete | Validated ZIP bundle packaging                                                          |
| ✅ Complete | PR comment posting and update flow                                                      |
| ✅ Complete | Causality scoring                                                                       |
| ✅ Complete | Changed-file correlation                                                                |
| ✅ Complete | Cache state reporting                                                                   |
| ✅ Complete | Reproduction command generation                                                         |
| ✅ Complete | CLI `inspect`                                                                           |
| ✅ Complete | CLI `diff`                                                                              |
| ✅ Complete | CLI `capture-local`                                                                     |
| ✅ Complete | CLI `replay`                                                                            |
| ✅ Complete | CLI `history`                                                                           |
| ✅ Complete | Flaky test detection                                                                    |
| ✅ Complete | Configuration loading                                                                   |
| ✅ Complete | Lint and typecheck failure parsing                                                      |
| ✅ Complete | Docker build failure parsing                                                            |
| ✅ Complete | End-to-end fixture integration tests                                                    |
| ✅ Complete | CLI `open`                                                                              |
| 📋 Planned  | Semantic release and npm publishing                                                     |

## Action Inputs

| Input               | Default            | Description                              |
| ------------------- | ------------------ | ---------------------------------------- |
| `failed-step-name`  | none               | Name of the step that failed.            |
| `failed-command`    | none               | Command that failed.                     |
| `exit-code`         | none               | Exit code from the failed command.       |
| `log-tail`          | none               | Tail of the failed step log.             |
| `log-tail-lines`    | `200`              | Maximum number of log lines to include.  |
| `comment-verbosity` | `brief`            | `brief`, `standard`, or `full`.          |
| `bundle-name`       | `failure-pack.zip` | Name of the generated ZIP bundle.        |
| `config-path`       | auto-detect        | Optional path to `.ci-failure-pack.yml`. |

## `.ci-failure-pack.yml`

```yaml
comment_verbosity: brief
bundle_name: failure-pack.zip
log_tail_lines: 200
flaky_detection: true
auto_open_flaky_issue: false
sensitive_env_vars:
  - STRIPE_SECRET_KEY
artifact_globs:
  - "test-results/**/*"
causality_weights:
  lockfile_changed: 90
  runtime_version_mismatch: 85
  missing_env_var: 80
  cache_miss_after_lockfile: 65
  test_file_changed: 55
  flaky_history: 40
  network_dependent_test: 20
  runner_resource_pressure: 10
```

Every option has a default. Unknown fields are ignored with a warning so future config additions remain forward compatible.

## CLI Commands

```text
npx ci-failure-pack inspect failure-pack.zip
npx ci-failure-pack diff failure-pack.zip
npx ci-failure-pack capture-local
npx ci-failure-pack replay failure-pack.zip --dry-run
npx ci-failure-pack history "Button renders"
npx ci-failure-pack open failure-pack.zip
```

Current implementation status: `inspect`, `diff`, `capture-local`, `replay`, `history`, and `open` are implemented. Capture, intelligence, parsers, flaky detection, configuration loading, lint/typecheck parsing, Docker parsing, and fixture integration tests are complete.

## Comparison

| Tool                       | Captures failure evidence | PR diagnosis | Local replay path | Requires hosted dashboard |
| -------------------------- | ------------------------- | ------------ | ----------------- | ------------------------- |
| CI Failure Pack            | Yes                       | Yes          | Yes               | No                        |
| GitHub Actions logs        | Partial                   | No           | No                | No                        |
| Test reporters             | Test output only          | Sometimes    | No                | No                        |
| CI observability platforms | Yes                       | Yes          | Sometimes         | Usually                   |

## Security

- Basic use requires no user-provided secrets.
- Secret-like environment variables are redacted before bundle creation.
- Redacted variable names may be shown; values are never written.
- Replay is guarded and asks before risky git operations.

## License

MIT
