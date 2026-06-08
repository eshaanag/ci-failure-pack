import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

import {
  bundleManifestSchema,
  bundleMetadataSchema,
  environmentSnapshotSchema,
  failedCommandSchema,
  gitContextSchema,
  parsedTestOutputSchema,
  type BundleFileEntry,
  type BundleManifest,
  type BundleMetadata,
  type CaptureError,
  type EnvironmentSnapshot,
  type FailedCommand,
  type GitContext,
  type ParsedTestOutput,
} from "@ci-failure-pack/shared";
import archiver from "archiver";
import fg from "fast-glob";
import { z } from "zod";

const DEFAULT_MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

interface PreparedEntry {
  manifestEntry: BundleFileEntry;
  buffer?: Buffer;
  absolutePath?: string;
}

export interface PackageBundleOptions {
  outputPath: string;
  cwd?: string;
  maxBundleBytes?: number;
  artifactGlobs?: readonly string[];
  manifest: Omit<BundleManifest, "files" | "errors">;
  errors?: readonly CaptureError[];
  metadata: BundleMetadata;
  environment: EnvironmentSnapshot;
  testOutput: ParsedTestOutput;
  gitContext: GitContext;
  failedCommand: FailedCommand;
}

export interface PackagedBundleResult {
  outputPath: string;
  manifest: BundleManifest;
  uncompressedSizeBytes: number;
}

const packageOptionsSchema = z.object({
  outputPath: z.string().min(1),
  cwd: z.string().min(1),
  maxBundleBytes: z.number().int().positive(),
  artifactGlobs: z.array(z.string().min(1)),
});

function hash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function bufferEntry(
  path: string,
  mediaType: string,
  required: boolean,
  buffer: Buffer,
): PreparedEntry {
  return {
    buffer,
    manifestEntry: {
      path,
      mediaType,
      required,
      sizeBytes: buffer.byteLength,
      sha256: hash(buffer),
    },
  };
}

async function artifactEntries(
  cwd: string,
  artifactGlobs: readonly string[],
  errors: CaptureError[],
): Promise<PreparedEntry[]> {
  let paths: string[];
  try {
    paths = await fg([...artifactGlobs], { cwd, onlyFiles: true, unique: true, dot: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown artifact glob error";
    errors.push({
      module: "bundle.artifacts",
      severity: "warning",
      message: `Artifact globs could not be expanded: ${message}`,
      recovery: "Check artifact_globs in .ci-failure-pack.yml.",
    });
    return [];
  }

  const entries: PreparedEntry[] = [];
  for (const relativePath of paths.sort()) {
    const absolutePath = join(cwd, relativePath);
    try {
      const content = await readFile(absolutePath);
      const archivePath = `artifacts/${relativePath.split(sep).join("/")}`;
      entries.push({
        absolutePath,
        manifestEntry: {
          path: archivePath,
          mediaType: "application/octet-stream",
          required: false,
          sizeBytes: content.byteLength,
          sha256: hash(content),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown artifact read error";
      errors.push({
        module: "bundle.artifacts",
        severity: "warning",
        message: `Artifact ${relativePath} could not be included: ${message}`,
        recovery: "Check that the artifact exists and is readable by the CI runner.",
      });
    }
  }
  return entries;
}

async function writeArchive(outputPath: string, entries: readonly PreparedEntry[]): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);
      for (const entry of entries) {
        if (entry.buffer !== undefined) {
          archive.append(entry.buffer, { name: entry.manifestEntry.path });
        } else if (entry.absolutePath !== undefined) {
          archive.file(entry.absolutePath, { name: entry.manifestEntry.path });
        }
      }
      void archive.finalize();
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown ZIP write error";
    throw new Error(`Could not write failure pack to ${outputPath}: ${message}`, { cause: error });
  }
}

/**
 * Creates a validated failure-pack ZIP from captured CI evidence and optional artifact globs.
 *
 * @param options - Manifest base, captured models, artifact globs, size budget, and output path.
 * @returns The final validated manifest and uncompressed bundle size.
 */
export async function createFailurePack(
  options: PackageBundleOptions,
): Promise<PackagedBundleResult> {
  const settings = packageOptionsSchema.parse({
    outputPath: options.outputPath,
    cwd: options.cwd ?? process.cwd(),
    maxBundleBytes: options.maxBundleBytes ?? DEFAULT_MAX_BUNDLE_BYTES,
    artifactGlobs: [...(options.artifactGlobs ?? [])],
  });
  const metadata = bundleMetadataSchema.parse(options.metadata);
  const environment = environmentSnapshotSchema.parse(options.environment);
  const testOutput = parsedTestOutputSchema.parse(options.testOutput);
  const gitContext = gitContextSchema.parse(options.gitContext);
  const failedCommand = failedCommandSchema.parse(options.failedCommand);
  const errors = [...(options.errors ?? [])];

  const entries: PreparedEntry[] = [
    bufferEntry("metadata.json", "application/json", true, jsonBuffer(metadata)),
    bufferEntry("env.json", "application/json", true, jsonBuffer(environment)),
    bufferEntry("test-output.json", "application/json", true, jsonBuffer(testOutput)),
    bufferEntry("git-context.json", "application/json", true, jsonBuffer(gitContext)),
    bufferEntry("failed-command.json", "application/json", true, jsonBuffer(failedCommand)),
    bufferEntry("log.txt", "text/plain", true, Buffer.from(failedCommand.logTail, "utf8")),
    ...(await artifactEntries(settings.cwd, settings.artifactGlobs, errors)),
  ];

  const manifest = bundleManifestSchema.parse({
    ...options.manifest,
    files: entries.map(({ manifestEntry }) => manifestEntry),
    errors,
  });
  const manifestEntry = bufferEntry(
    "manifest.json",
    "application/json",
    true,
    jsonBuffer(manifest),
  );
  const uncompressedSizeBytes =
    manifestEntry.manifestEntry.sizeBytes +
    entries.reduce((total, entry) => total + entry.manifestEntry.sizeBytes, 0);
  if (uncompressedSizeBytes > settings.maxBundleBytes) {
    throw new Error(
      `Failure pack input is ${uncompressedSizeBytes} bytes, above the ${settings.maxBundleBytes} byte limit. Reduce artifact_globs and retry.`,
    );
  }

  await writeArchive(settings.outputPath, [manifestEntry, ...entries]);
  return { outputPath: settings.outputPath, manifest, uncompressedSizeBytes };
}
