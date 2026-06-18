import path from "node:path"

import { Command } from "@commander-js/extra-typings"

import { createSourcePathOption } from "@/options"
import { getInvocationCwd } from "@/path-utils"

/**
 * Builds the generate-import-config command structure without action handlers.
 * Used for documentation and metadata extraction.
 */
export function buildGenerateImportConfigCommandStructure() {
  return new Command("generate-import-config")
    .description(
      "Generate an import.config.mjs from already-pulled schemas in schemas/generated"
    )
    .addOption(createSourcePathOption())
    .option(
      "--output <path>",
      "Output file path for the generated config",
      path.join(getInvocationCwd(), "import.config.mjs")
    )
    .option("--force", "Overwrite existing config without confirmation", false)
}
