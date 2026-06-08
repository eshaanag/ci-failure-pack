import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import AdmZip from "adm-zip";
import chalk from "chalk";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export interface HtmlReportOpener {
  open(filePath: string): Promise<void>;
}

export interface OpenBundleReportOptions {
  opener?: HtmlReportOpener | undefined;
  outputDirectory?: string | undefined;
}

interface HtmlEntry {
  name: string;
  data: Buffer;
}

const defaultOpener: HtmlReportOpener = {
  async open(filePath: string): Promise<void> {
    const platform = process.platform;
    const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", filePath] : [filePath];
    try {
      await execFileAsync(command, args);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown opener error";
      throw new Error(`OS opener failed for ${filePath}: ${message}`, { cause: error });
    }
  },
};

function preferredHtmlEntry(entries: readonly HtmlEntry[]): HtmlEntry | undefined {
  return entries.find((entry) => basename(entry.name).toLowerCase() === "index.html") ?? entries[0];
}

async function readHtmlEntry(bundlePath: string): Promise<HtmlEntry> {
  try {
    await access(bundlePath);
  } catch (error: unknown) {
    throw new Error(
      `Could not open ${bundlePath} — file not found. Run the action first, then download the artifact from the workflow run.`,
      { cause: error },
    );
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(bundlePath);
    zip.getEntries();
  } catch (error: unknown) {
    throw new Error(
      `Could not read ${bundlePath} — the ZIP is corrupt. Download the workflow artifact again.`,
      { cause: error },
    );
  }

  const htmlEntries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".html"))
    .map((entry) => ({ name: entry.entryName, data: entry.getData() }));
  const htmlEntry = preferredHtmlEntry(htmlEntries);
  if (htmlEntry === undefined) {
    throw new Error(
      `No HTML report was found in ${bundlePath}. Configure artifact_globs to include your Playwright or coverage HTML report, then rerun the action.`,
    );
  }
  return htmlEntry;
}

async function writeReport(
  bundlePath: string,
  entry: HtmlEntry,
  outputDirectory?: string,
): Promise<string> {
  const bundleHash = createHash("sha256").update(bundlePath).digest("hex").slice(0, 12);
  const directory = outputDirectory ?? join(tmpdir(), "ci-failure-pack-reports", bundleHash);
  const fileName = basename(entry.name) || "report.html";
  const reportPath = join(directory, fileName);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(reportPath, entry.data);
    return reportPath;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown file write error";
    throw new Error(`Could not extract HTML report from ${bundlePath}: ${message}`, {
      cause: error,
    });
  }
}

/**
 * Extracts and opens the first HTML report from a failure bundle.
 *
 * @param bundlePath - Path to failure-pack.zip.
 * @param options - Optional output directory and opener injection for tests.
 * @returns Human-readable success output with the extracted report path.
 */
export async function openBundleReport(
  bundlePath: string,
  options: OpenBundleReportOptions = {},
): Promise<string> {
  const path = z.string().min(1).parse(bundlePath);
  const entry = await readHtmlEntry(path);
  const reportPath = await writeReport(path, entry, options.outputDirectory);
  try {
    await (options.opener ?? defaultOpener).open(reportPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown opener error";
    throw new Error(
      `Could not open HTML report at ${reportPath}. Open that file manually in your browser. Details: ${message}`,
      { cause: error },
    );
  }
  return `${chalk.green("✓")} Opened HTML report ${entry.name}\n${chalk.gray(reportPath)}`;
}
