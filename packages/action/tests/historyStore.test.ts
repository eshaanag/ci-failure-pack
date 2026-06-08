import type { FailureHistory } from "@ci-failure-pack/shared";
import { describe, expect, it } from "vitest";

import {
  historyCacheKey,
  readFailureHistory,
  writeFailureHistorySafely,
  type HistoryStorageAdapter,
} from "../src/history/store.js";

const history: FailureHistory = {
  repository: "owner/repo",
  updatedAt: "2026-06-08T00:00:00.000Z",
  records: [],
};

describe("history store", () => {
  it("builds a stable repository cache key", () => {
    expect(historyCacheKey("owner/repo")).toBe("ci-failure-pack-history-owner-repo");
  });

  it("reads and validates existing history", async () => {
    const adapter: HistoryStorageAdapter = {
      read: () => Promise.resolve(JSON.stringify(history)),
      write: () => Promise.resolve(),
    };

    await expect(readFailureHistory(adapter, "key")).resolves.toEqual(history);
  });

  it("treats storage write failures as non-fatal warnings", async () => {
    const adapter: HistoryStorageAdapter = {
      read: () => Promise.resolve(undefined),
      write: () => Promise.reject(new Error("cache unavailable")),
    };

    const result = await writeFailureHistorySafely(adapter, "key", history);

    expect(result.ok).toBe(false);
    expect(result.warning).toContain("Could not persist flaky-test history");
  });
});
