/**
 * Config registry command metadata — only the command structure, no action handlers.
 */
import { Command } from "@commander-js/extra-typings"

import { sourcePathOption } from "@/options"

export function buildConfigRegistryCommandStructure() {
  return new Command("create-registry")
    .description(
      "Generates the config registry to ensure the type-safety while using `createPermission`"
    )
    .addOption(sourcePathOption)
}
