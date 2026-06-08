import { describe, expect, it, vi } from "vitest";

import { captureFailedCommand } from "../src/capture/failedCommand.js";

describe("captureFailedCommand", () => {
  it("captures the failed step, command, and exit code", async () => {
    const result = await captureFailedCommand({
      stepName: "Test",
      command: "pnpm test",
      exitCode: 1,
      logTail: "failure",
    });

    expect(result).toEqual({
      stepName: "Test",
      command: "pnpm test",
      exitCode: 1,
      logTail: "failure",
      truncated: false,
    });
  });

  it("keeps only the configured number of final log lines", async () => {
    const result = await captureFailedCommand({
      logTail: "one\ntwo\nthree\nfour",
      logTailLines: 2,
    });

    expect(result.logTail).toBe("three\nfour");
    expect(result.truncated).toBe(true);
  });

  it("falls back to the GitHub step summary when inputs are missing", async () => {
    const read = vi.fn().mockResolvedValue("summary failure");
    const result = await captureFailedCommand({
      env: { GITHUB_STEP_SUMMARY: "/tmp/summary" },
      reader: { read },
    });

    expect(read).toHaveBeenCalledWith("/tmp/summary");
    expect(result.logTail).toBe("summary failure");
  });

  it("returns a partial record and warning when fallback reads fail", async () => {
    const warn = vi.fn();
    const result = await captureFailedCommand({
      env: { GITHUB_STEP_SUMMARY: "/missing" },
      reader: { read: vi.fn().mockRejectedValue(new Error("ENOENT")) },
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    });

    expect(result).toEqual({ logTail: "", truncated: false });
    expect(warn).toHaveBeenCalledOnce();
  });
});
