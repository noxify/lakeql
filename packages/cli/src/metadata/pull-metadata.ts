/**
 * Pull command metadata — only the command structure, no action handlers.
 * This keeps the dependency tree clean for documentation builds.
 */
import { Command, Option } from "@commander-js/extra-typings"

import {
  catalogOption,
  schemaOption,
  sourcePathOption,
  tableOption,
  tableOrSchemaOption,
} from "@/options"

const bulkOption = new Option(
  "--bulk",
  "Run in bulk mode using a config file"
).default(false)

const bulkConfigOption = new Option(
  "--bulk-config <path>",
  "Path to the bulk import config file (default: import.config.{mjs,ts,js,json})"
)

/**
 * Builds the pull command structure (options/arguments) without action handlers.
 * Used for documentation and metadata extraction.
 */
export function buildPullCommandStructure() {
  const program = new Command("pull")
  return program
    .description(
      "Interactive query endpoint generation based on a remote table"
    )
    .addOption(catalogOption)
    .addOption(tableOrSchemaOption)
    .addOption(schemaOption.makeOptionMandatory(false))
    .addOption(
      tableOption
        .makeOptionMandatory(false)
        .default([])
        .argParser((value, previous: string[]) => [...previous, value])
    )
    .addOption(
      new Option("--skip-registry", "Skip registry update").default(false)
    )
    .addOption(sourcePathOption)
    .addOption(bulkOption)
    .addOption(bulkConfigOption)
}
