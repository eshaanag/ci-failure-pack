import { access } from "node:fs/promises";

import {
  bundleManifestSchema,
  bundleMetadataSchema,
  cacheStateSchema,
  causalityScoreSchema,
  environmentSnapshotSchema,
  failedCommandSchema,
  gitContextSchema,
  parsedTestOutputSchema,
  reproductionCommandSchema,
  type BundleManifest,
  type BundleMetadata,
  type CacheState,
  type CausalityScore,
  type EnvironmentSnapshot,
  type FailedCommand,
  type GitContext,
  type ParsedTestOutput,
  type ReproductionCommand,
} from "@ci-failure-pack/shared";
import AdmZip from "adm-zip";
import { z } from "zod";

export interface ReadableFailurePack {
  manifest: BundleManifest;
  metadata: BundleMetadata;
  environment: EnvironmentSnapshot;
  testOutput: ParsedTestOutput;
  gitContext: GitContext;
  failedCommand: FailedCommand;
  cacheState?: CacheState | undefined;
  causality: CausalityScore[];
  reproduction?: ReproductionCommand | undefined;
  logTail: string;
}

interface Parser<T> {
  parse(value: unknown): T;
}

function readJsonEntry<T>(
  zip: AdmZip,
  name: string,
  parser: Parser<T>,
  required: boolean,
): T | undefined {
  const entry = zip.getEntry(name);
  if (entry === null) {
    if (required) {
      throw new Error(`The bundle is missing required entry ${name}.`);
    }
    return undefined;
  }
  try {
    const decoded: unknown = JSON.parse(entry.getData().toString("utf8"));
    return parser.parse(decoded);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown JSON validation error";
    throw new Error(`The bundle entry ${name} is invalid: ${message}`, { cause: error });
  }
}

function readTextEntry(zip: AdmZip, name: string): string {
  return zip.getEntry(name)?.getData().toString("utf8") ?? "";
}

/**
 * Opens and validates a CI Failure Pack ZIP for CLI commands.
 *
 * @param bundlePath - Path to failure-pack.zip.
 * @returns Validated required bundle data and optional intelligence entries.
 */
export async function readFailurePack(bundlePath: string): Promise<ReadableFailurePack> {
  const path = z.string().min(1).parse(bundlePath);
  try {
    await access(path);
  } catch (error: unknown) {
    throw new Error(
      `Could not open ${path} — file not found. Run the action first, then download the artifact from the workflow run.`,
      { cause: error },
    );
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(path);
    zip.getEntries();
  } catch (error: unknown) {
    throw new Error(
      `Could not read ${path} — the ZIP is corrupt. Download the workflow artifact again.`,
      {
        cause: error,
      },
    );
  }

  return {
    manifest: readJsonEntry(zip, "manifest.json", bundleManifestSchema, true)!,
    metadata: readJsonEntry(zip, "metadata.json", bundleMetadataSchema, true)!,
    environment: readJsonEntry(zip, "env.json", environmentSnapshotSchema, true)!,
    testOutput: readJsonEntry(zip, "test-output.json", parsedTestOutputSchema, true)!,
    gitContext: readJsonEntry(zip, "git-context.json", gitContextSchema, true)!,
    failedCommand: readJsonEntry(zip, "failed-command.json", failedCommandSchema, true)!,
    cacheState: readJsonEntry(zip, "cache-state.json", cacheStateSchema, false),
    causality: readJsonEntry(zip, "causality.json", causalityScoreSchema.array(), false) ?? [],
    reproduction: readJsonEntry(zip, "reproduction.json", reproductionCommandSchema, false),
    logTail: readTextEntry(zip, "log.txt"),
  };
}
