/**
 * Create endpoint command metadata — only the command structure, no action handlers.
 */
import { Command, Option } from "@commander-js/extra-typings"

import { skipRegistry, sourcePathOption } from "@/options"

export function buildCreateEndpointCommandStructure() {
  return new Command("create-endpoint")
    .description("Create a custom endpoint from a JSON definition file")
    .addOption(
      new Option(
        "--from-file <path>",
        "Path to a JSON definition file conforming to the Endpoint_Definition_Format"
      ).makeOptionMandatory(true)
    )
    .addOption(sourcePathOption)
    .addOption(skipRegistry)
    .addOption(
      new Option(
        "--force",
        "Overwrite existing files without prompting"
      ).default(false)
    )
}
