import { describe, expect, it, vi } from "vitest";

import { captureCacheState, hasCacheMissAfterLockfile } from "../src/capture/cacheState.js";

describe("captureCacheState", () => {
  it("reports a cache hit from environment output", async () => {
    const state = await captureCacheState({ env: { ACTIONS_PNPM_CACHE_HIT: "true" } });
    expect(state.caches).toEqual([{ name: "pnpm", key: "", hit: true, source: "env" }]);
  });

  it("emits the cache-miss-after-lockfile causality signal", async () => {
    const state = await captureCacheState({
      env: { ACTIONS_NODE_MODULES_CACHE_HIT: "false" },
      changedFiles: ["pnpm-lock.yaml"],
    });
    expect(hasCacheMissAfterLockfile(state)).toBe(true);
  });

  it("returns an empty state when the workflow has no cache steps", async () => {
    const state = await captureCacheState({ env: {}, changedFiles: [] });
    expect(state).toEqual({ caches: [], lockfileChanged: false, packageChanges: [] });
  });

  it("reads cache-hit values from GITHUB_OUTPUT", async () => {
    const state = await captureCacheState({
      env: { GITHUB_OUTPUT: "/tmp/output" },
      reader: { read: vi.fn().mockResolvedValue("pnpm-cache-hit=false\nother=value") },
    });
    expect(state.caches[0]).toMatchObject({ name: "pnpm", hit: false, source: "actions-cache" });
  });

  it("continues when GITHUB_OUTPUT cannot be read", async () => {
    const warn = vi.fn();
    const state = await captureCacheState({
      env: { GITHUB_OUTPUT: "/missing" },
      reader: { read: vi.fn().mockRejectedValue(new Error("ENOENT")) },
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    });
    expect(state.caches).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });
});
