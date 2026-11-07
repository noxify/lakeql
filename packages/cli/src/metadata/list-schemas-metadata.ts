/**
 * List schemas command metadata — only the command structure, no action handlers.
 */
import { Command } from "@commander-js/extra-typings"

import { createCatalogOption, createDataSourceOption } from "@/options"

export function buildListSchemasCommandStructure() {
  const program = new Command("list-schemas")
  return program
    .description("Lists the available schemas for the configured catalog")
    .addOption(createDataSourceOption())
    .addOption(createCatalogOption())
}
