import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { reproductionCommandSchema } from "./schemas/index.js";
import type {
  EnvironmentSnapshot,
  FailedCommand,
  ReproductionCommand,
  ReproductionStep,
} from "./types/index.js";

export interface ReproductionFileSystem {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

export interface ReproductionCommandOptions {
  cwd?: string;
  failedCommand?: FailedCommand;
  environment?: EnvironmentSnapshot;
  fileSystem?: ReproductionFileSystem;
}

const defaultFileSystem: ReproductionFileSystem = {
  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  async read(path: string): Promise<string> {
    try {
      return await readFile(path, "utf8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown project file read error";
      throw new Error(`Could not read project file ${path}: ${message}`, { cause: error });
    }
  },
};

function envValue(environment: EnvironmentSnapshot | undefined, name: string): string | undefined {
  return environment?.safe.find((variable) => variable.name === name)?.value;
}

async function readOptional(
  fileSystem: ReproductionFileSystem,
  path: string,
): Promise<string | undefined> {
  try {
    if (!(await fileSystem.exists(path))) {
      return undefined;
    }
    return (await fileSystem.read(path)).trim();
  } catch {
    return undefined;
  }
}

function step(command: string, reason: string, safeToRun = true): ReproductionStep {
  return { command, reason, safeToRun };
}

function appendFailure(
  steps: ReproductionStep[],
  failedCommand: FailedCommand | undefined,
  fallback: string,
): void {
  steps.push(step(failedCommand?.command ?? fallback, "Run the command that failed in CI."));
}

async function nodeCommand(
  options: Required<Pick<ReproductionCommandOptions, "cwd" | "fileSystem">> &
    ReproductionCommandOptions,
): Promise<ReproductionCommand | undefined> {
  const { cwd, fileSystem } = options;
  if (!(await fileSystem.exists(join(cwd, "package.json")))) {
    return undefined;
  }
  const steps: ReproductionStep[] = [];
  const nvmVersion = await readOptional(fileSystem, join(cwd, ".nvmrc"));
  const fnmVersion = await readOptional(fileSystem, join(cwd, ".node-version"));
  const toolVersions = await readOptional(fileSystem, join(cwd, ".tool-versions"));
  const asdfVersion = /(?:^|\n)nodejs\s+(\S+)/.exec(toolVersions ?? "")?.[1];
  const capturedVersion = envValue(options.environment, "NODE_VERSION");
  if (nvmVersion !== undefined)
    steps.push(step(`nvm use ${nvmVersion}`, "Match the Node version pinned by .nvmrc."));
  else if (fnmVersion !== undefined)
    steps.push(step(`fnm use ${fnmVersion}`, "Match the Node version pinned by .node-version."));
  else if (asdfVersion !== undefined)
    steps.push(
      step(`asdf local nodejs ${asdfVersion}`, "Match the Node version in .tool-versions."),
    );
  else if (capturedVersion !== undefined) {
    steps.push(
      step(
        `# Install or select Node ${capturedVersion}`,
        "No version manager file was found.",
        false,
      ),
    );
  }

  let install = "npm install";
  if (await fileSystem.exists(join(cwd, "pnpm-lock.yaml")))
    install = "pnpm install --frozen-lockfile";
  else if (await fileSystem.exists(join(cwd, "yarn.lock")))
    install = "yarn install --frozen-lockfile";
  else if (await fileSystem.exists(join(cwd, "package-lock.json"))) install = "npm ci";
  else if (
    (await fileSystem.exists(join(cwd, "bun.lockb"))) ||
    (await fileSystem.exists(join(cwd, "bun.lock")))
  ) {
    install = "bun install --frozen-lockfile";
  }
  steps.push(step(install, "Install the exact dependency graph used by CI."));
  appendFailure(steps, options.failedCommand, "npm test");
  return reproductionCommandSchema.parse({
    projectType: "node",
    summary: "Reproduce the Node.js CI failure.",
    commands: steps,
  });
}

async function pythonCommand(
  options: Required<Pick<ReproductionCommandOptions, "cwd" | "fileSystem">> &
    ReproductionCommandOptions,
): Promise<ReproductionCommand | undefined> {
  const { cwd, fileSystem } = options;
  const hasPyproject = await fileSystem.exists(join(cwd, "pyproject.toml"));
  const hasRequirements = await fileSystem.exists(join(cwd, "requirements.txt"));
  const hasPipfile = await fileSystem.exists(join(cwd, "Pipfile"));
  if (!hasPyproject && !hasRequirements && !hasPipfile) {
    return undefined;
  }
  const steps: ReproductionStep[] = [];
  const version = await readOptional(fileSystem, join(cwd, ".python-version"));
  if (version !== undefined)
    steps.push(step(`pyenv local ${version}`, "Match the Python version pinned by the project."));
  if (hasRequirements)
    steps.push(step("pip install -r requirements.txt", "Install project dependencies."));
  else if (hasPyproject)
    steps.push(
      step('pip install -e ".[dev]"', "Install the project and development dependencies."),
    );
  else
    steps.push(
      step(
        "pip install pipenv && pipenv install --dev",
        "Install Pipfile development dependencies.",
      ),
    );
  appendFailure(steps, options.failedCommand, "pytest");
  return reproductionCommandSchema.parse({
    projectType: "python",
    summary: "Reproduce the Python CI failure.",
    commands: steps,
  });
}

async function goCommand(
  options: Required<Pick<ReproductionCommandOptions, "cwd" | "fileSystem">> &
    ReproductionCommandOptions,
): Promise<ReproductionCommand | undefined> {
  if (!(await options.fileSystem.exists(join(options.cwd, "go.mod")))) return undefined;
  const steps = [step("go mod download", "Download the module graph used by the project.")];
  appendFailure(steps, options.failedCommand, "go test ./...");
  return reproductionCommandSchema.parse({
    projectType: "go",
    summary: "Reproduce the Go CI failure.",
    commands: steps,
  });
}

async function rustCommand(
  options: Required<Pick<ReproductionCommandOptions, "cwd" | "fileSystem">> &
    ReproductionCommandOptions,
): Promise<ReproductionCommand | undefined> {
  if (!(await options.fileSystem.exists(join(options.cwd, "Cargo.toml")))) return undefined;
  const steps: ReproductionStep[] = [];
  const version =
    (await readOptional(options.fileSystem, join(options.cwd, "rust-toolchain.toml"))) ??
    envValue(options.environment, "RUST_VERSION");
  if (version !== undefined)
    steps.push(step(`rustup override set ${version}`, "Match the Rust toolchain used by CI."));
  steps.push(step("cargo build --tests", "Build test targets before replay."));
  appendFailure(steps, options.failedCommand, "cargo test");
  return reproductionCommandSchema.parse({
    projectType: "rust",
    summary: "Reproduce the Rust CI failure.",
    commands: steps,
  });
}

/**
 * Generates a validated, explained local reproduction command sequence from project conventions.
 *
 * @param options - Project directory, captured command/environment, and optional file-system adapter.
 * @returns A Node, Python, Go, Rust, or generic reproduction command.
 */
export async function generateReproductionCommand(
  options: ReproductionCommandOptions = {},
): Promise<ReproductionCommand> {
  const resolved = {
    ...options,
    cwd: options.cwd ?? process.cwd(),
    fileSystem: options.fileSystem ?? defaultFileSystem,
  };
  return (
    (await nodeCommand(resolved)) ??
    (await pythonCommand(resolved)) ??
    (await goCommand(resolved)) ??
    (await rustCommand(resolved)) ??
    reproductionCommandSchema.parse({
      projectType: "unknown",
      summary: "No recognized project type was found.",
      commands: [
        step(
          options.failedCommand?.command ??
            "# Inspect failure-pack.zip and run the captured failing command",
          "Use the captured command because project conventions were not recognized.",
          options.failedCommand?.command !== undefined,
        ),
      ],
    })
  );
}
