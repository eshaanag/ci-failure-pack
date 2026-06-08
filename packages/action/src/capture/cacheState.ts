import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import {
  cacheStateSchema,
  type CacheEntry,
  type CacheState,
  type Logger,
  type PackageChange,
} from "@ci-failure-pack/shared";
import { z } from "zod";

import { createLogger } from "../lib/logger.js";

const lockfileNames = new Set([
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
  "poetry.lock",
  "Pipfile.lock",
]);

export interface CacheOutputReader {
  read(path: string): Promise<string>;
}

export interface CacheStateOptions {
  env?: Readonly<Record<string, string | undefined>>;
  changedFiles?: readonly string[];
  packageChanges?: readonly PackageChange[];
  reader?: CacheOutputReader;
  logger?: Logger;
}

const defaultReader: CacheOutputReader = {
  async read(path: string): Promise<string> {
    try {
      return await readFile(path, "utf8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown cache output read error";
      throw new Error(`Could not read cache output file ${path}: ${message}`, { cause: error });
    }
  },
};

function cacheName(name: string): string {
  return name
    .replace(/^ACTIONS_/, "")
    .replace(/_CACHE_HIT$/, "")
    .replace(/^CACHE_HIT_/, "")
    .replace(/[-_]CACHE[-_]?HIT$/i, "")
    .toLowerCase()
    .replaceAll("_", "-");
}

function hitFrom(value: string): boolean {
  return value.trim().toLowerCase() === "true";
}

function parseOutput(content: string): CacheEntry[] {
  return content.split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) {
      return [];
    }
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/(?:^|[-_])cache[-_]?hit$/i.test(name)) {
      return [];
    }
    return [
      { name: cacheName(name), key: "", hit: hitFrom(value), source: "actions-cache" as const },
    ];
  });
}

function deduplicate(entries: readonly CacheEntry[]): CacheEntry[] {
  const byName = new Map<string, CacheEntry>();
  for (const entry of entries) {
    byName.set(entry.name, entry);
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Captures cache hits, misses, lockfile state, and known package changes.
 *
 * @param options - Environment, changed files, package changes, and optional injected dependencies.
 * @returns A schema-validated cache state.
 */
export async function captureCacheState(options: CacheStateOptions = {}): Promise<CacheState> {
  const env = z.record(z.string(), z.string().optional()).parse(options.env ?? process.env);
  const changedFiles = z.array(z.string().min(1)).parse(options.changedFiles ?? []);
  const entries: CacheEntry[] = Object.entries(env).flatMap(([name, value]) => {
    if (value === undefined || !/(?:^ACTIONS_.*_CACHE_HIT$|^CACHE_HIT_.*$)/.test(name)) {
      return [];
    }
    return [{ name: cacheName(name), key: "", hit: hitFrom(value), source: "env" as const }];
  });

  const outputPath = env["GITHUB_OUTPUT"];
  if (outputPath !== undefined && outputPath.trim() !== "") {
    try {
      entries.push(...parseOutput(await (options.reader ?? defaultReader).read(outputPath)));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown cache output read error";
      (options.logger ?? createLogger()).warn(
        "Cache output could not be read; continuing with environment values.",
        {
          error: message,
          recovery: "Expose cache-hit outputs as environment variables for richer cache reporting.",
        },
      );
    }
  }

  return cacheStateSchema.parse({
    caches: deduplicate(entries),
    lockfileChanged: changedFiles.some((path) => lockfileNames.has(basename(path))),
    packageChanges: options.packageChanges ?? [],
  });
}

/**
 * Returns whether cache state supports the cold-install-after-lockfile causality signal.
 *
 * @param state - Captured cache state.
 * @returns True when a cache missed and the pull request changed a lockfile.
 */
export function hasCacheMissAfterLockfile(state: CacheState): boolean {
  const parsed = cacheStateSchema.parse(state);
  return parsed.lockfileChanged && parsed.caches.some(({ hit }) => !hit);
}
