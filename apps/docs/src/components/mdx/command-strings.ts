import type { CommandProps } from "renoun"

import type {
  ExecutionMode,
  PackageManager,
} from "@/components/mdx/command-client"

/** Package managers offered by every `Command` variant, in display order. */
export const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm"]

/** Execution modes offered by the `exec` variant, in display order. */
export const EXECUTION_MODES: ExecutionMode[] = ["local", "oneoff"]

/**
 * Package name published on the registry for the LakeQL CLI. The binary exposed
 * by the package is `lakeql-cli`, so one-off runners (`npx` / `pnpm dlx`) must
 * resolve the scoped package name, while a locally installed project runs the
 * binary directly.
 */
const CLI_PACKAGE_NAME = "@lakeql/cli"
const CLI_BINARY_NAME = "lakeql-cli"

const COMMAND_PREFIXES: Record<
  NonNullable<CommandProps["variant"]>,
  Record<PackageManager, string>
> = {
  create: {
    npm: "npm create",
    pnpm: "pnpm create",
  },
  exec: {
    npm: "npx",
    pnpm: "pnpm dlx",
  },
  install: {
    npm: "npm install",
    pnpm: "pnpm add",
  },
  "install-dev": {
    npm: "npm install --save-dev",
    pnpm: "pnpm add -D",
  },
  run: {
    npm: "npm run",
    pnpm: "pnpm",
  },
}

/**
 * Prefixes for `variant="exec"` across both execution modes. `local` runs the
 * installed project binary (`lakeql-cli`); `oneoff` fetches the scoped package
 * through a one-off runner.
 */
const EXEC_PREFIXES: Record<ExecutionMode, Record<PackageManager, string>> = {
  local: {
    npm: "npm exec",
    pnpm: "pnpm",
  },
  oneoff: {
    npm: "npx",
    pnpm: "pnpm dlx",
  },
}

function rewriteExecSubject(executionMode: ExecutionMode, subject: string) {
  if (executionMode === "local" || !subject.startsWith(CLI_BINARY_NAME)) {
    return subject
  }

  // One-off runners resolve a registry package by name, so the scoped package
  // name replaces the bare binary name.
  return `${CLI_PACKAGE_NAME}${subject.slice(CLI_BINARY_NAME.length)}`
}

/**
 * Builds a single command string for a non-`exec` variant.
 *
 * @param packageManager - The package manager whose prefix is applied.
 * @param variant - The command variant (any variant except `exec`).
 * @param subject - The command subject (e.g. `@lakeql/app my-api`).
 * @returns The runnable command string.
 */
export function buildCommand(
  packageManager: PackageManager,
  variant: NonNullable<CommandProps["variant"]>,
  subject: string
): string {
  const prefix = COMMAND_PREFIXES[variant][packageManager]
  return `${prefix} ${subject}`.trim()
}

/**
 * Builds a single `exec` command string for one execution mode and package
 * manager, rewriting the bare binary name to the scoped package for one-off
 * runners.
 *
 * @param packageManager - The package manager whose prefix is applied.
 * @param executionMode - `local` (installed binary) or `oneoff` (one-off run).
 * @param subject - The command subject (e.g. `lakeql-cli pull --env .env`).
 * @returns The runnable command string.
 */
export function buildExecCommand(
  packageManager: PackageManager,
  executionMode: ExecutionMode,
  subject: string
): string {
  const prefix = EXEC_PREFIXES[executionMode][packageManager]
  const resolvedSubject = rewriteExecSubject(executionMode, subject)
  return `${prefix} ${resolvedSubject}`.trim()
}
