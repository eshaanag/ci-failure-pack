import { describe, expect, it } from "vitest";

import { captureEnvironment } from "../src/capture/environment.js";

const CAPTURED_AT = "2026-06-08T00:00:00.000Z";

describe("captureEnvironment", () => {
  it("captures common safe CI values", () => {
    const snapshot = captureEnvironment({
      capturedAt: CAPTURED_AT,
      env: { NODE_ENV: "test", CI: "true", RUNNER_OS: "Linux" },
    });

    expect(snapshot.safe).toEqual([
      { name: "CI", value: "true", source: "process" },
      { name: "NODE_ENV", value: "test", source: "process" },
      { name: "RUNNER_OS", value: "Linux", source: "process" },
    ]);
    expect(snapshot.redacted).toEqual([]);
  });

  it("redacts GITHUB_TOKEN by name without leaking its value", () => {
    const secret = "github_pat_never_include_this_value";
    const snapshot = captureEnvironment({ capturedAt: CAPTURED_AT, env: { GITHUB_TOKEN: secret } });

    expect(snapshot.redacted).toEqual([
      { name: "GITHUB_TOKEN", marker: "[REDACTED:name]", reason: "name" },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });

  it("redacts a high-entropy value regardless of its name", () => {
    const snapshot = captureEnvironment({
      capturedAt: CAPTURED_AT,
      env: { SESSION: "aB3$kL9!pQ2@xY7#vN4%mT8&zR6*" },
    });

    expect(snapshot.redacted[0]).toEqual({
      name: "SESSION",
      marker: "[REDACTED:entropy]",
      reason: "entropy",
    });
  });

  it("does not redact explicit public build values", () => {
    const snapshot = captureEnvironment({
      capturedAt: CAPTURED_AT,
      env: { VITE_PUBLIC_URL: "https://example.test/a-long-public-build-value-123456789" },
    });

    expect(snapshot.safe[0]?.name).toBe("VITE_PUBLIC_URL");
    expect(snapshot.redacted).toEqual([]);
  });

  it("returns an empty snapshot for an empty environment", () => {
    const snapshot = captureEnvironment({ capturedAt: CAPTURED_AT, env: {} });

    expect(snapshot).toEqual({ capturedAt: CAPTURED_AT, safe: [], redacted: [], missing: [] });
  });

  it("never leaks values when every variable is secret", () => {
    const firstSecret = "first-secret-value";
    const secondSecret = "second-secret-value";
    const snapshot = captureEnvironment({
      capturedAt: CAPTURED_AT,
      env: { APP_SECRET: firstSecret, DATABASE_URL: secondSecret },
    });

    const serialized = JSON.stringify(snapshot);
    expect(snapshot.safe).toEqual([]);
    expect(snapshot.redacted).toHaveLength(2);
    expect(serialized).not.toContain(firstSecret);
    expect(serialized).not.toContain(secondSecret);
  });

  it("honors explicitly configured sensitive variable names", () => {
    const snapshot = captureEnvironment({
      capturedAt: CAPTURED_AT,
      env: { INTERNAL_HOST: "build.internal" },
      sensitiveEnvVars: ["INTERNAL_HOST"],
    });

    expect(snapshot.redacted[0]?.reason).toBe("config");
  });

  it("recognizes GitHub Actions masked values", () => {
    const snapshot = captureEnvironment({
      capturedAt: CAPTURED_AT,
      env: { ACTIONS_CACHE_VALUE: "***" },
    });

    expect(snapshot.redacted[0]?.reason).toBe("github-mask");
  });

  it("records configured safe variables that are missing", () => {
    const snapshot = captureEnvironment({
      capturedAt: CAPTURED_AT,
      env: { CI: "true" },
      expectedSafeVars: ["NODE_ENV", "CI"],
    });

    expect(snapshot.missing).toEqual([
      { name: "NODE_ENV", expectedBecause: "configured safe environment variable" },
    ]);
  });
});
