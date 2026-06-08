import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openBundleReport } from "../src/commands/open.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ci-failure-pack-open-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function writeZip(path: string, entries: Readonly<Record<string, string>>): void {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content, "utf8"));
  }
  zip.writeZip(path);
}

describe("openBundleReport", () => {
  it("extracts and opens the preferred index HTML report", async () => {
    const bundlePath = join(directory, "failure-pack.zip");
    const outputDirectory = join(directory, "reports");
    const open = vi.fn<(_: string) => Promise<void>>(() => Promise.resolve());
    writeZip(bundlePath, {
      "artifacts/playwright/report.html": "<h1>Report</h1>",
      "artifacts/playwright/index.html": "<h1>Index</h1>",
    });

    const output = await openBundleReport(bundlePath, {
      outputDirectory,
      opener: { open },
    });

    expect(open).toHaveBeenCalledWith(join(outputDirectory, "index.html"));
    expect(output).toContain("Opened HTML report artifacts/playwright/index.html");
  });

  it("returns a helpful error when no HTML report is present", async () => {
    const bundlePath = join(directory, "failure-pack.zip");
    writeZip(bundlePath, { "manifest.json": "{}" });

    await expect(openBundleReport(bundlePath, { opener: { open: vi.fn() } })).rejects.toThrow(
      "Configure artifact_globs",
    );
  });

  it("returns a clean error for a corrupt ZIP", async () => {
    const bundlePath = join(directory, "corrupt.zip");
    await writeFile(bundlePath, "not a zip");

    await expect(openBundleReport(bundlePath, { opener: { open: vi.fn() } })).rejects.toThrow(
      "the ZIP is corrupt",
    );
  });

  it("reports opener failures with the extracted report path", async () => {
    const bundlePath = join(directory, "failure-pack.zip");
    writeZip(bundlePath, { "report.html": "<h1>Report</h1>" });

    await expect(
      openBundleReport(bundlePath, {
        outputDirectory: join(directory, "reports"),
        opener: { open: () => Promise.reject(new Error("no browser")) },
      }),
    ).rejects.toThrow("Open that file manually");
  });
});
