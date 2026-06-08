import { describe, expect, it } from "vitest";

import {
  generateReproductionCommand,
  type ReproductionFileSystem,
} from "../src/reproductionCommand.js";

function memoryFileSystem(files: Readonly<Record<string, string>>): ReproductionFileSystem {
  return {
    exists(path: string): Promise<boolean> {
      return Promise.resolve(files[path] !== undefined);
    },
    read(path: string): Promise<string> {
      const value = files[path];
      return value === undefined ? Promise.reject(new Error("ENOENT")) : Promise.resolve(value);
    },
  };
}

describe("generateReproductionCommand", () => {
  it("generates the Node.js pnpm sequence", async () => {
    const result = await generateReproductionCommand({
      cwd: "/repo",
      fileSystem: memoryFileSystem({
        "/repo/package.json": "{}",
        "/repo/pnpm-lock.yaml": "lockfileVersion: 9",
        "/repo/.nvmrc": "20.11.1",
      }),
      failedCommand: { command: "pnpm test -- user", logTail: "", truncated: false },
    });
    expect(result.projectType).toBe("node");
    expect(result.commands.map(({ command }) => command)).toEqual([
      "nvm use 20.11.1",
      "pnpm install --frozen-lockfile",
      "pnpm test -- user",
    ]);
  });

  it("generates a Python requirements sequence", async () => {
    const result = await generateReproductionCommand({
      cwd: "/repo",
      fileSystem: memoryFileSystem({
        "/repo/requirements.txt": "pytest",
        "/repo/.python-version": "3.12.2",
      }),
    });
    expect(result.projectType).toBe("python");
    expect(result.commands.map(({ command }) => command)).toContain(
      "pip install -r requirements.txt",
    );
  });

  it("suggests a captured Node version when no version manager file exists", async () => {
    const result = await generateReproductionCommand({
      cwd: "/repo",
      fileSystem: memoryFileSystem({ "/repo/package.json": "{}" }),
      environment: {
        capturedAt: "2026-06-08T00:00:00.000Z",
        safe: [{ name: "NODE_VERSION", value: "20.11.1", source: "detected" }],
        redacted: [],
        missing: [],
      },
    });
    expect(result.commands[0]).toMatchObject({
      command: "# Install or select Node 20.11.1",
      safeToRun: false,
    });
  });

  it("returns generic fallback instructions for an unknown project", async () => {
    const result = await generateReproductionCommand({
      cwd: "/repo",
      fileSystem: memoryFileSystem({}),
    });
    expect(result.projectType).toBe("unknown");
    expect(result.commands[0]?.command).toContain("Inspect failure-pack.zip");
  });
});
