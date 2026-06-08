# CI Failure Pack Design System

## PR Comment Philosophy

The PR comment is a journalist's lede, not a logfile. It answers the most important question first: what failed and what should the developer try next. Details are available, but the default comment is brief.

## Verbosity Levels

### Brief

Default. Maximum four visible lines.

```md
<!-- ci-failure-pack -->
❌ test failed in CI
UserService creates users, Billing retries declined cards — 2 assertions failed
⚠ Likely: Node version mismatch (62%)
▶ Reproduce: npx ci-failure-pack replay failure-pack.zip
```

Rules:

- One failure headline.
- Up to two test names, then `+N more`.
- One likely cause.
- One replay instruction.

### Standard

Brief plus environment and artifact context.

```md
<!-- ci-failure-pack -->
❌ test failed in CI
UserService creates users, Billing retries declined cards — 2 assertions failed
⚠ Likely: Node version mismatch (62%)
▶ Reproduce: npx ci-failure-pack replay failure-pack.zip

| Check | CI | Local action |
| --- | --- | --- |
| Node | 20.11.1 | run `ci-failure-pack diff` |
| Cache | miss | lockfile changed |

Artifact: failure-pack.zip
```

Rules:

- Keep table under five rows.
- Do not show secret values.
- Include artifact link when available.

### Full

Standard plus details blocks.

```md
<details>
<summary>Failed tests</summary>

| Test | File | Assertion |
| --- | --- | --- |
| UserService creates users | tests/user.test.ts | expected 201, got 500 |

</details>

<details>
<summary>Log tail</summary>

```text
last 200 lines
```

</details>
```

Rules:

- All noisy content is collapsed.
- Full log tail is capped.
- Redacted variables show names and redaction reasons only.

## CLI Output Design

The CLI uses `chalk` for color, `cli-table3` for alignment, and plain text symbols so output remains accessible without color.

### Palette

- Green: success and matches.
- Yellow: warnings and mismatches.
- Red: failures and invalid bundles.
- Cyan: commands and file paths.
- Gray: secondary metadata.

### Symbol System

- `✓`: success or match.
- `⚠`: warning or mismatch.
- `✕`: failure or invalid input.
- `▶`: command to run.
- `→`: result or transition.

Color never carries meaning alone. Every colored state also has a symbol and text label.

### Column Rules

- Left column is the subject.
- Middle columns are observed values.
- Right column is the action or status.
- Values are truncated only when the full value is unsafe or too long for terminal readability.

Example diff:

```text
⚠  Node version    CI: 20.11.1    Local: 22.2.0     → MISMATCH
✓  pnpm version    CI: 9.1.1      Local: 9.1.1      → match
⚠  DATABASE_URL    CI: set        Local: not set    → missing locally
✓  NODE_ENV        CI: test       Local: test       → match
```

## Progress Indicators

Use `ora` only for operations that may take longer than 500ms:

- Reading large bundles.
- Detecting local tool versions.
- Running guarded replay steps.
- Extracting reports.

Do not spin for instant validation or formatting.

## Error Message Design

Every user-facing error has two parts:

1. What happened.
2. What to do next.

Examples:

```text
✕ Could not open failure-pack.zip — file not found.
  Run the action on a failed workflow, download the artifact, then pass its path to this command.
```

```text
✕ The bundle manifest is invalid — missing workflow.jobName.
  Download the artifact again. If this repeats, open an issue with the manifest validation output.
```

## Bundle Contents Design

When a developer unzips the bundle manually, the file names should explain themselves:

- `manifest.json`: what this bundle is.
- `metadata.json`: where it came from.
- `env.json`: CI environment, redacted.
- `test-output.json`: normalized failures.
- `git-context.json`: commit, branch, and changed files.
- `log.txt`: the useful tail, not the whole firehose.
- `artifacts/`: optional extra files requested by config.

## History Output

Timeline format:

```text
Failure history: Button renders with defaults

2026-06-08  a1b2c3d  failed  no related changes  run 182901
2026-06-02  d4e5f6a  failed  no related changes  run 181774
2026-05-29  9aa12bc  failed  no related changes  run 180992

Classification: likely flaky
```

## Accessibility

- Do not rely on color alone.
- Keep tables readable in monochrome terminals.
- Avoid dense walls of text in PR comments.
- Use collapsible details for long content.
- Redaction markers are textual and explicit.
