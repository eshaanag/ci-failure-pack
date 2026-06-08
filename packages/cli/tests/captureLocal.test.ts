import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { environmentSnapshotSchema } from "@ci-failure-pack/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { captureLocalEnvironment } from "../src/commands/captureLocal.js";
import type { LocalCommandRunner } from "../src/lib/localEnv.js";

let directory: string;

const runner: LocalCommandRunner = {
  run(command: string): Promise<string> {
    if (command === "node") {
      return Promise.resolve("v20.11.1");
    }
    return Promise.reject(new Error(`${command} unavailable`));
  },
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ci-failure-pack-local-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("captureLocalEnvironment", () => {
  it("creates a schema-valid local snapshot file", async () => {
    const outputPath = join(directory, "local.json");

    const result = await captureLocalEnvironment({
      outputPath,
      runner,
      env: { NODE_ENV: "test" },
      capturedAt: "2026-06-08T00:00:00.000Z",
    });
    const parsed: unknown = JSON.parse(await readFile(outputPath, "utf8"));

    expect(result.outputPath).toBe(outputPath);
    expect(environmentSnapshotSchema.parse(parsed).safe).toEqual(
      expect.arrayContaining([{ name: "NODE_VERSION", value: "20.11.1", source: "detected" }]),
    );
  });

  it("overwrites an existing file after confirmation", async () => {
    const outputPath = join(directory, "existing.json");
    await writeFile(outputPath, "old", "utf8");
    let promptedPath = "";

    await captureLocalEnvironment({
      outputPath,
      runner,
      capturedAt: "2026-06-08T00:00:00.000Z",
      confirmOverwrite: (path: string): Promise<boolean> => {
        promptedPath = path;
        return Promise.resolve(true);
      },
    });

    expect(promptedPath).toBe(outputPath);
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toHaveProperty("capturedAt");
  });

  it("does not overwrite an existing file when confirmation is declined", async () => {
    const outputPath = join(directory, "declined.json");
    await writeFile(outputPath, "old", "utf8");

    await expect(
      captureLocalEnvironment({
        outputPath,
        runner,
        confirmOverwrite: (): Promise<boolean> => Promise.resolve(false),
      }),
    ).rejects.toThrow("Refused to overwrite");
    await expect(readFile(outputPath, "utf8")).resolves.toBe("old");
  });

  it("returns a clear error for a non-writable output target", async () => {
    await expect(
      captureLocalEnvironment({
        outputPath: join(directory, "local.json"),
        runner,
        writeSnapshot: (): Promise<void> => Promise.reject(new Error("EACCES: permission denied")),
      }),
    ).rejects.toThrow("Choose a writable --output path");
  });
});
