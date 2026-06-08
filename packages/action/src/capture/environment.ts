import {
  environmentSnapshotSchema,
  type EnvironmentSnapshot,
  type RedactionReason,
} from "@ci-failure-pack/shared";

const PUBLIC_SAFE_NAMES = new Set(["CI", "NODE_ENV", "RUNNER_OS", "GITHUB_REF", "GITHUB_SHA"]);
const PUBLIC_SAFE_PREFIXES = ["VITE_PUBLIC_", "NEXT_PUBLIC_"];
const SECRET_NAME_PATTERN = /(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS|DSN)(?:$|_)/i;
const API_NAME_PATTERN = /(?:^|_)API(?:$|_)/i;
const GITHUB_MASK_NAME_PATTERN = /^ACTIONS_.*_VALUE$/i;
const GITHUB_MASK_VALUE_PATTERN = /^(?:\*{3,}|\[?REDACTED\]?|<REDACTED>)$/i;

export interface EnvironmentCaptureOptions {
  env?: Readonly<Record<string, string | undefined>>;
  sensitiveEnvVars?: readonly string[];
  expectedSafeVars?: readonly string[];
  entropyThreshold?: number;
  capturedAt?: string;
}

function isPublicSafeName(name: string): boolean {
  return (
    PUBLIC_SAFE_NAMES.has(name) || PUBLIC_SAFE_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

function hasSecretName(name: string): boolean {
  return name === "DATABASE_URL" || SECRET_NAME_PATTERN.test(name) || API_NAME_PATTERN.test(name);
}

function shannonEntropy(value: string): number {
  const frequencies = new Map<string, number>();
  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function isHighEntropy(value: string, threshold: number): boolean {
  return value.length >= 24 && shannonEntropy(value) >= threshold;
}

function redactionReason(
  name: string,
  value: string,
  sensitiveNames: ReadonlySet<string>,
  entropyThreshold: number,
): RedactionReason | undefined {
  if (isPublicSafeName(name)) {
    return undefined;
  }
  if (hasSecretName(name)) {
    return "name";
  }
  if (sensitiveNames.has(name)) {
    return "config";
  }
  if (isHighEntropy(value, entropyThreshold)) {
    return "entropy";
  }
  if (GITHUB_MASK_NAME_PATTERN.test(name) || GITHUB_MASK_VALUE_PATTERN.test(value)) {
    return "github-mask";
  }
  return undefined;
}

/**
 * Captures an environment snapshot while irreversibly redacting secret-like values.
 *
 * @param options - Optional injected environment and redaction configuration.
 * @returns A schema-validated environment snapshot with safe, redacted, and missing entries.
 */
export function captureEnvironment(options: EnvironmentCaptureOptions = {}): EnvironmentSnapshot {
  const env = options.env ?? process.env;
  const sensitiveNames = new Set(options.sensitiveEnvVars ?? []);
  const entropyThreshold = options.entropyThreshold ?? 3.5;
  const safe: EnvironmentSnapshot["safe"] = [];
  const redacted: EnvironmentSnapshot["redacted"] = [];

  for (const [name, value] of Object.entries(env).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (value === undefined) {
      continue;
    }

    const reason = redactionReason(name, value, sensitiveNames, entropyThreshold);
    if (reason === undefined) {
      safe.push({ name, value, source: "process" });
    } else {
      redacted.push({ name, marker: `[REDACTED:${reason}]`, reason });
    }
  }

  const presentNames = new Set([
    ...safe.map(({ name }) => name),
    ...redacted.map(({ name }) => name),
  ]);
  const missing = [...(options.expectedSafeVars ?? [])]
    .filter((name) => !presentNames.has(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ name, expectedBecause: "configured safe environment variable" }));

  return environmentSnapshotSchema.parse({
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    safe,
    redacted,
    missing,
  });
}
