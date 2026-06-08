import type { EnvironmentSnapshot } from "@ci-failure-pack/shared";
import { describe, expect, it } from "vitest";

import { diffEnvironmentSnapshots, renderEnvironmentDiff } from "../src/commands/diff.js";

function snapshot(
  safe: EnvironmentSnapshot["safe"],
  redacted: EnvironmentSnapshot["redacted"] = [],
): EnvironmentSnapshot {
  return {
    capturedAt: "2026-06-08T00:00:00.000Z",
    safe,
    redacted,
    missing: [],
  };
}

describe("diffEnvironmentSnapshots", () => {
  it("flags a version mismatch with a warning row", () => {
    const rows = diffEnvironmentSnapshots(
      snapshot([{ name: "NODE_VERSION", value: "20.11.1", source: "detected" }]),
      snapshot([{ name: "NODE_VERSION", value: "22.1.0", source: "detected" }]),
    );

    expect(rows).toEqual([
      {
        symbol: "⚠",
        name: "NODE_VERSION",
        ci: "20.11.1",
        local: "22.1.0",
        status: "MISMATCH",
      },
    ]);
  });

  it("shows matching versions as successful rows", () => {
    const rows = diffEnvironmentSnapshots(
      snapshot([{ name: "PNPM_VERSION", value: "9.1.1", source: "detected" }]),
      snapshot([{ name: "PNPM_VERSION", value: "9.1.1", source: "detected" }]),
    );

    expect(rows).toEqual([
      {
        symbol: "✓",
        name: "PNPM_VERSION",
        ci: "9.1.1",
        local: "9.1.1",
        status: "match",
      },
    ]);
  });

  it("flags CI environment values that are missing locally", () => {
    const rows = diffEnvironmentSnapshots(
      snapshot([], [{ name: "DATABASE_URL", marker: "[REDACTED:name]", reason: "name" }]),
      snapshot([]),
    );

    expect(rows).toEqual([
      {
        symbol: "⚠",
        name: "DATABASE_URL",
        ci: "set",
        local: "not set",
        status: "missing locally",
      },
    ]);
  });
});

describe("renderEnvironmentDiff", () => {
  it("prints an environment match message when no differences exist", () => {
    const output = renderEnvironmentDiff([
      {
        symbol: "✓",
        name: "NODE_ENV",
        ci: "test",
        local: "test",
        status: "match",
      },
    ]);

    expect(output).toContain("Environment matches CI");
  });
});
