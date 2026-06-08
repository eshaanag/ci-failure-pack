import { failureHistorySchema, type FailureHistory } from "@ci-failure-pack/shared";

export interface HistoryStorageAdapter {
  read(key: string): Promise<string | undefined>;
  write(key: string, value: string): Promise<void>;
}

export interface HistoryWriteResult {
  ok: boolean;
  warning?: string | undefined;
}

/**
 * Builds the stable GitHub Actions Cache key for repository failure history.
 *
 * @param repository - Repository full name, such as owner/repo.
 * @returns Cache key used for failure history.
 */
export function historyCacheKey(repository: string): string {
  return `ci-failure-pack-history-${repository.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
}

/**
 * Reads and validates failure history from a storage adapter.
 *
 * @param adapter - Storage adapter backed by a cache or local fixture.
 * @param key - History cache key.
 * @returns Validated history, or undefined when no history exists.
 */
export async function readFailureHistory(
  adapter: HistoryStorageAdapter,
  key: string,
): Promise<FailureHistory | undefined> {
  const raw = await adapter.read(key);
  if (raw === undefined) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(raw);
  return failureHistorySchema.parse(parsed);
}

/**
 * Writes failure history while converting storage failures into non-fatal warnings.
 *
 * @param adapter - Storage adapter backed by a cache or local fixture.
 * @param key - History cache key.
 * @param history - Failure history to validate and write.
 * @returns Write result with a warning when persistence failed.
 */
export async function writeFailureHistorySafely(
  adapter: HistoryStorageAdapter,
  key: string,
  history: FailureHistory,
): Promise<HistoryWriteResult> {
  try {
    const validated = failureHistorySchema.parse(history);
    await adapter.write(key, `${JSON.stringify(validated, null, 2)}\n`);
    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown history storage error";
    return {
      ok: false,
      warning: `Could not persist flaky-test history: ${message}. The action will continue without updating history.`,
    };
  }
}
