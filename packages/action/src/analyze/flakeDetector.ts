import {
  failureHistorySchema,
  gitContextSchema,
  parsedTestOutputSchema,
  type FailureHistory,
  type FlakeFailureOccurrence,
  type GitContext,
  type ParsedTestOutput,
} from "@ci-failure-pack/shared";

export interface FlakeClassification {
  testName: string;
  file?: string | undefined;
  classification: "flaky" | "broken" | "unknown";
  failureCount: number;
  reason: string;
}

export interface FlakeDetectionOptions {
  testOutput: ParsedTestOutput;
  history: FailureHistory;
  gitContext: GitContext;
  relatedFilesChanged: boolean;
}

function distinctCommitCount(failures: readonly FlakeFailureOccurrence[]): number {
  return new Set(failures.map(({ commitSha }) => commitSha)).size;
}

function classifyFailure(
  testName: string,
  file: string | undefined,
  failures: readonly FlakeFailureOccurrence[],
  relatedFilesChanged: boolean,
): FlakeClassification {
  const failureCount = failures.length;
  const commitCount = distinctCommitCount(failures);
  const unrelatedFailureCount = failures.filter(
    ({ relatedFilesChanged: related }) => !related,
  ).length;
  if (failureCount >= 3 && commitCount >= 3 && unrelatedFailureCount >= 3 && !relatedFilesChanged) {
    return {
      testName,
      file,
      classification: "flaky",
      failureCount,
      reason: `${testName} failed ${failureCount} times across ${commitCount} commits without related changes.`,
    };
  }
  if (failureCount === 0 && relatedFilesChanged) {
    return {
      testName,
      file,
      classification: "broken",
      failureCount: 1,
      reason: `${testName} has no prior failures and related files changed in this pull request.`,
    };
  }
  return {
    testName,
    file,
    classification: "unknown",
    failureCount,
    reason:
      failureCount < 3
        ? `${testName} has insufficient failure history for a flaky classification.`
        : `${testName} has history, but related changes or duplicate commits make the cause unclear.`,
  };
}

/**
 * Classifies current failed tests as flaky, broken, or unknown from failure history.
 *
 * @param options - Parsed failures, validated history, git context, and current related-change state.
 * @returns One classification per current failed test.
 */
export function classifyFlakyTests(options: FlakeDetectionOptions): FlakeClassification[] {
  const testOutput = parsedTestOutputSchema.parse(options.testOutput);
  const history = failureHistorySchema.parse(options.history);
  gitContextSchema.parse(options.gitContext);
  return testOutput.failed.map((failure) => {
    const record = history.records.find(({ testName }) => testName === failure.name);
    return classifyFailure(
      failure.name,
      failure.file,
      record?.failures ?? [],
      options.relatedFilesChanged,
    );
  });
}
