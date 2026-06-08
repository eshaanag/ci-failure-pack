import type { ParsedTestOutput, TestFailure } from "../types/index.js";
import { emptyParsedTestOutput, rawParserInputSchema } from "./common.js";

const buildKitRunPattern = /^(#\d+)\s+\[[^\]]+\]\s+RUN\s+(.+)$/gm;
const buildKitErrorPattern =
  /^(#\d+)\s+ERROR:\s+process\s+"\/bin\/sh\s+-c\s+(.+?)"\s+did not complete successfully:\s+exit code:\s+(\d+)/m;
const classicRunPattern = /^Step\s+(\d+\/\d+)\s+:\s+RUN\s+(.+)$/gm;
const classicErrorPattern =
  /^The command ['"]\/bin\/sh\s+-c\s+(.+?)['"] returned a non-zero code:\s+(\d+)/m;

function failure(command: string, step: string, exitCode: string, stack: string): TestFailure {
  return {
    name: `Docker RUN failed: ${command}`,
    assertion: `Docker ${step} exited ${exitCode}`,
    stack,
  };
}

function parseBuildKit(raw: string): TestFailure | undefined {
  const runs = new Map<string, string>();
  for (const match of raw.matchAll(buildKitRunPattern)) {
    const step = match[1];
    const command = match[2];
    if (step !== undefined && command !== undefined) {
      runs.set(step, command);
    }
  }
  const error = buildKitErrorPattern.exec(raw);
  const step = error?.[1];
  const command = error?.[2];
  const exitCode = error?.[3];
  if (step === undefined || command === undefined || exitCode === undefined) {
    return undefined;
  }
  return failure(runs.get(step) ?? command, step, exitCode, raw);
}

function parseClassic(raw: string): TestFailure | undefined {
  let lastRun: { step: string; command: string } | undefined;
  for (const match of raw.matchAll(classicRunPattern)) {
    const step = match[1];
    const command = match[2];
    if (step !== undefined && command !== undefined) {
      lastRun = { step, command };
    }
  }
  const error = classicErrorPattern.exec(raw);
  const command = error?.[1];
  const exitCode = error?.[2];
  if (lastRun === undefined || command === undefined || exitCode === undefined) {
    return undefined;
  }
  return failure(lastRun.command || command, `step ${lastRun.step}`, exitCode, raw);
}

/** Parses Docker BuildKit or classic build output into normalized failure output. */
export function parseDockerBuild(raw: string): ParsedTestOutput {
  const input = rawParserInputSchema.safeParse(raw);
  if (!input.success || input.data.trim() === "") {
    return emptyParsedTestOutput("docker-build");
  }
  const found = parseBuildKit(input.data) ?? parseClassic(input.data);
  if (found === undefined) {
    return emptyParsedTestOutput("docker-build");
  }
  return {
    format: "docker-build",
    total: 1,
    passed: 0,
    skipped: 0,
    failed: [found],
    durationMs: 0,
    parserErrors: [],
  };
}
