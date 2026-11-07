/**
 * Command metadata extractor for documentation.
 * This module is isolated from CLI runtime dependencies to avoid bundling
 * Node.js-specific packages (like chokidar) into browser/SSR builds.
 *
 * All commands are built from clean metadata structures that don't include
 * action handlers or runtime dependencies.
 */
import type { Argument, Option } from "@commander-js/extra-typings"

import { buildInitCommandStructure } from "@/commands/init-metadata"
import { buildAddCommandStructure } from "@/metadata/add-metadata"
import { buildCreateEndpointCommandStructure } from "@/metadata/create-endpoint-metadata"
import { buildCreateRegistryCommandStructure } from "@/metadata/create-registry-metadata"
import { buildGenerateImportConfigCommandStructure } from "@/metadata/generate-import-config-metadata"
import { buildListColumnsCommandStructure } from "@/metadata/list-columns-metadata"
import { buildListSchemasCommandStructure } from "@/metadata/list-schemas-metadata"
import { buildListTablesCommandStructure } from "@/metadata/list-tables-metadata"
import { buildListViewsCommandStructure } from "@/metadata/list-views-metadata"
import { buildProgramStructure } from "@/metadata/program-metadata"
import { buildPullCommandStructure } from "@/metadata/pull-metadata"

type AvailableCommand =
  | "add"
  | "create-registry"
  | "create-endpoint"
  | "generate-import-config"
  | "init"
  | "list-columns"
  | "list-schemas"
  | "list-tables"
  | "list-views"
  | "pull"

export interface CommandArgumentMeta {
  name: string
  description: string
  required: boolean
  variadic: boolean
  defaultValue?: unknown
  defaultValueDescription?: string
}

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

export interface CommandConfig {
  name: string
  description: string
  arguments: CommandArgumentMeta[]
  options: CommandOptionMeta[]
}

function extractArgumentMeta(arg: Argument): CommandArgumentMeta {
  const meta: CommandArgumentMeta = {
    name: arg.name(),
    description: arg.description,
    required: arg.required,
    variadic: arg.variadic,
  }

  if (arg.defaultValue !== undefined) {
    meta.defaultValue = arg.defaultValue
  }
  if (arg.defaultValueDescription) {
    meta.defaultValueDescription = arg.defaultValueDescription
  }

  return meta
}

function extractOptionMeta(option: Option): CommandOptionMeta {
  const meta: CommandOptionMeta = {
    flags: option.flags,
    description: option.description,
    required: option.mandatory,
    isBoolean: !option.required && !option.optional,
  }

  if (option.defaultValue !== undefined && !option.defaultValueDescription) {
    meta.defaultValue = option.defaultValue
  }
  if (option.defaultValueDescription) {
    meta.defaultValueDescription = option.defaultValueDescription
  }
  if (option.envVar) {
    meta.envVar = option.envVar
  }
  if (option.long) {
    meta.long = option.long
  }
  if (option.short) {
    meta.short = option.short
  }
  if (option.argChoices?.length) {
    meta.choices = option.argChoices
  }

  return meta
}

const commandFactories: Record<string, () => unknown> = {
  add: buildAddCommandStructure,
  "create-registry": buildCreateRegistryCommandStructure,
  "create-endpoint": buildCreateEndpointCommandStructure,
  "generate-import-config": buildGenerateImportConfigCommandStructure,
  init: buildInitCommandStructure,
  "list-columns": buildListColumnsCommandStructure,
  "list-schemas": buildListSchemasCommandStructure,
  "list-tables": buildListTablesCommandStructure,
  "list-views": buildListViewsCommandStructure,
  pull: buildPullCommandStructure,
}

export function getCommandConfig(commandName: string): CommandConfig {
  const commandFn = commandFactories[commandName]

  if (!commandFn) {
    throw new Error(`No command named '${commandName}'`)
  }

  const command = commandFn() as {
    name: () => string
    description: () => string
    registeredArguments: Argument[]
    options: Option[]
  }

  return {
    name: command.name(),
    description: command.description(),
    arguments: command.registeredArguments.map(extractArgumentMeta),
    options: command.options.map(extractOptionMeta),
  }
}

export const availableCommands: AvailableCommand[] = Object.keys(
  commandFactories
) as AvailableCommand[]

/**
 * Returns the root program's metadata: its name, description, and global
 * options (e.g. `--env`). Extracted the same way as per-command options so
 * documentation can render global options in one place.
 */
export function getProgramConfig(): CommandConfig {
  const program = buildProgramStructure() as unknown as {
    name: () => string
    description: () => string
    registeredArguments: Argument[]
    options: Option[]
  }

  return {
    name: program.name(),
    description: program.description(),
    arguments: program.registeredArguments.map(extractArgumentMeta),
    options: program.options.map(extractOptionMeta),
  }
}
