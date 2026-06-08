import {
  causalityWeightsSchema,
  type CausalityScore,
  type CausalityWeights,
} from "@ci-failure-pack/shared";
import { z } from "zod";

const evidenceSchema = z.object({
  lockfileChanged: z.boolean().default(false),
  runtimeVersionMismatch: z.boolean().default(false),
  missingEnvVar: z.boolean().default(false),
  cacheMissAfterLockfile: z.boolean().default(false),
  testFileChanged: z.boolean().default(false),
  flakyHistory: z.boolean().default(false),
  networkDependentTest: z.boolean().default(false),
  runnerResourcePressure: z.boolean().default(false),
});

export type CausalityEvidence = z.infer<typeof evidenceSchema>;

interface SignalDefinition {
  key: keyof CausalityEvidence;
  weightKey: keyof CausalityWeights;
  signal: string;
  label: string;
  evidence: string;
}

const SIGNALS: readonly SignalDefinition[] = [
  {
    key: "lockfileChanged",
    weightKey: "lockfileChanged",
    signal: "lockfile_changed",
    label: "Lockfile changed",
    evidence: "This PR changed a dependency lockfile.",
  },
  {
    key: "runtimeVersionMismatch",
    weightKey: "runtimeVersionMismatch",
    signal: "runtime_version_mismatch",
    label: "Runtime version mismatch",
    evidence: "The CI runtime differs from the project version file.",
  },
  {
    key: "missingEnvVar",
    weightKey: "missingEnvVar",
    signal: "missing_env_var",
    label: "Missing environment variable",
    evidence: "A required environment variable is missing in CI.",
  },
  {
    key: "cacheMissAfterLockfile",
    weightKey: "cacheMissAfterLockfile",
    signal: "cache_miss_after_lockfile",
    label: "Cold cache after lockfile change",
    evidence: "The dependency cache missed after lockfile changes.",
  },
  {
    key: "testFileChanged",
    weightKey: "testFileChanged",
    signal: "test_file_changed",
    label: "Failing test changed",
    evidence: "The failing test file was changed in this PR.",
  },
  {
    key: "flakyHistory",
    weightKey: "flakyHistory",
    signal: "flaky_history",
    label: "Flaky history",
    evidence: "This test has failed before without related changes.",
  },
  {
    key: "networkDependentTest",
    weightKey: "networkDependentTest",
    signal: "network_dependent_test",
    label: "Network-dependent test",
    evidence: "The failing test name suggests network dependency.",
  },
  {
    key: "runnerResourcePressure",
    weightKey: "runnerResourcePressure",
    signal: "runner_resource_pressure",
    label: "Runner resource pressure",
    evidence: "The job duration is much higher than baseline.",
  },
];

function normalize(scores: CausalityScore[]): CausalityScore[] {
  const total = scores.reduce((sum, score) => sum + score.weight, 0);
  if (total === 0) {
    return scores.map((score) => ({ ...score, percentage: 0 }));
  }
  const normalized = scores.map((score) => ({
    ...score,
    percentage: Math.round((score.weight / total) * 10_000) / 100,
  }));
  const sum = normalized.reduce((current, score) => current + score.percentage, 0);
  const drift = Math.round((100 - sum) * 100) / 100;
  if (normalized[0] !== undefined) {
    normalized[0] = {
      ...normalized[0],
      percentage: Math.round((normalized[0].percentage + drift) * 100) / 100,
    };
  }
  return normalized;
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/, "");
}

/** Detects whether a pinned Node version differs from a GitHub runner tool-cache path. */
export function detectNodeRuntimeMismatch(
  pinnedVersion: string | undefined,
  runnerToolCache: string | undefined,
): boolean {
  if (pinnedVersion === undefined || runnerToolCache === undefined) {
    return false;
  }
  const match = /(?:^|\/)node\/([^/]+)/.exec(runnerToolCache);
  if (match?.[1] === undefined) {
    return false;
  }
  return normalizeVersion(pinnedVersion) !== normalizeVersion(match[1]);
}

/**
 * Scores triggered causality signals and returns the top three ranked causes.
 *
 * @param evidence - Boolean evidence flags collected from capture and analysis modules.
 * @param weights - Optional custom signal weights.
 * @returns Ranked causality scores with percentages normalized across displayed causes.
 */
export function scoreCausality(
  evidence: Partial<CausalityEvidence>,
  weights: Partial<CausalityWeights> = {},
): CausalityScore[] {
  const parsedEvidence = evidenceSchema.parse(evidence);
  const parsedWeights = causalityWeightsSchema.parse(weights);
  const triggered = SIGNALS.flatMap((definition) => {
    if (!parsedEvidence[definition.key]) {
      return [];
    }
    const weight = parsedWeights[definition.weightKey];
    return [
      {
        signal: definition.signal,
        label: definition.label,
        weight,
        percentage: 0,
        evidence: definition.evidence,
      },
    ];
  })
    .filter((score) => score.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3);

  if (triggered.length === 0) {
    return [
      {
        signal: "unknown",
        label: "No specific cause identified — check log",
        weight: 0,
        percentage: 0,
        evidence: "No configured causality signal was triggered.",
      },
    ];
  }
  return normalize(triggered);
}
