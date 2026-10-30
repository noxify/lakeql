/**
 * create-app command metadata — only the command structure, no action handlers.
 * This keeps the dependency tree clean for documentation builds.
 */
import { Command, Option } from "@commander-js/extra-typings"

import { AUTH_STRATEGY_IDS } from "./features/auth-strategies"

/**
 * Builds the create-app command structure (options/arguments) without action handlers.
 * Used for documentation and metadata extraction.
 */
export function buildCreateAppCommandStructure() {
  return new Command("create-lakeql-app")
    .description("Scaffold a new LakeQL project with adapter selection")
    .argument("[project-name]", "Project directory name")
    .addOption(
      // Comma-separated list (e.g. "trino,fabric"); validated per-id in
      // resolveAdaptersFromFlag. No .choices() here — commander would validate
      // the whole comma-joined string against a single choice and reject it.
      new Option(
        "--adapters <ids>",
        "Comma-separated adapter IDs (trino, fabric)"
      )
    )
    .addOption(
      new Option(
        "--ds-names <names>",
        "Comma-separated data source names (same order as `--adapters`)"
      )
    )
    .addOption(
      new Option("--auth <strategy>", "Authentication strategy").choices(
        AUTH_STRATEGY_IDS
      )
    )
    .addOption(
      new Option(
        "-d, --target-dir <path>",
        "Parent directory to create the project in (default: current directory)"
      )
    )
    .addOption(
      new Option(
        "-p, --package-manager <pm>",
        "Package manager: npm, pnpm, yarn"
      )
    )
    .addOption(new Option("--no-install", "Skip dependency installation"))
    .addOption(
      new Option(
        "--dry-run",
        "Preview generated files without writing"
      ).default(false)
    )
    .addOption(
      new Option(
        "--local [path]",
        "Dev mode: scaffold from a local template dir (default: <cwd>/templates/app) and keep workspace:* dependency versions"
      )
    )
    .addOption(new Option("-q, --quiet", "Suppress all output"))
}

// === Pre-extracted config for documentation builds ===

export interface CommandOptionMeta {
  flags: string
  description: string
  required: boolean
  defaultValue?: unknown
  defaultValueDescription?: string
  envVar?: string
  isBoolean: boolean
  long?: string
  short?: string
  choices?: string[]
}

export interface CommandArgumentMeta {
  name: string
  description: string
  required: boolean
  variadic: boolean
  defaultValue?: unknown
  defaultValueDescription?: string
}

export interface CommandConfig {
  name: string
  description: string
  arguments: CommandArgumentMeta[]
  options: CommandOptionMeta[]
}

export function getCreateAppCommandConfig(): CommandConfig {
  const cmd = buildCreateAppCommandStructure()

  return {
    name: cmd.name(),
    description: cmd.description(),
    arguments: cmd.registeredArguments.map((arg) => ({
      defaultValue: arg.defaultValue as unknown,
      defaultValueDescription: arg.defaultValueDescription,
      description: arg.description,
      name: arg.name(),
      required: arg.required,
      variadic: arg.variadic,
    })),
    options: cmd.options.map((opt) => ({
      choices: opt.argChoices?.length
        ? (opt.argChoices as string[])
        : undefined,
      defaultValue: opt.defaultValue as unknown,
      defaultValueDescription: opt.defaultValueDescription ?? undefined,
      description: opt.description,
      envVar: opt.envVar ?? undefined,
      flags: opt.flags,
      isBoolean: !opt.required && !opt.optional,
      long: opt.long ?? undefined,
      required: opt.mandatory,
      short: opt.short ?? undefined,
    })),
  }
}
