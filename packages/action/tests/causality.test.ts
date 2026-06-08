import { describe, expect, it } from "vitest";

import { detectNodeRuntimeMismatch, scoreCausality } from "../src/analyze/causality.js";

describe("scoreCausality", () => {
  it("ranks lockfile changes as the top cause", () => {
    const scores = scoreCausality({ lockfileChanged: true, networkDependentTest: true });
    expect(scores[0]).toMatchObject({ signal: "lockfile_changed", label: "Lockfile changed" });
  });

  it("returns a stable unknown cause when no signal triggers", () => {
    const scores = scoreCausality({});
    expect(scores).toEqual([
      {
        signal: "unknown",
        label: "No specific cause identified — check log",
        weight: 0,
        percentage: 0,
        evidence: "No configured causality signal was triggered.",
      },
    ]);
  });

  it("normalizes all displayed causes to exactly 100 percent", () => {
    const scores = scoreCausality({
      lockfileChanged: true,
      runtimeVersionMismatch: true,
      missingEnvVar: true,
      cacheMissAfterLockfile: true,
      testFileChanged: true,
      flakyHistory: true,
      networkDependentTest: true,
      runnerResourcePressure: true,
    });
    expect(scores).toHaveLength(3);
    expect(scores.reduce((sum, score) => sum + score.percentage, 0)).toBe(100);
  });

  it("detects a Node version mismatch from a pinned version and RUNNER_TOOL_CACHE", () => {
    expect(detectNodeRuntimeMismatch("20.11.1", "/opt/hostedtoolcache/node/22.2.0/x64")).toBe(true);
    expect(detectNodeRuntimeMismatch("v20.11.1", "/opt/hostedtoolcache/node/20.11.1/x64")).toBe(
      false,
    );
  });
});
