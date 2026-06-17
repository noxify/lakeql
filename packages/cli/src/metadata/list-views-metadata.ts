/**
 * List views command metadata — only the command structure, no action handlers.
 */
import { Command } from "@commander-js/extra-typings"

import { createCatalogOption, createSchemaOption } from "@/options"

export function buildListViewsCommandStructure() {
  const program = new Command("list-views")
  return program
    .description("Lists the available views for the configured catalog/schema")
    .addOption(createCatalogOption())
    .addOption(createSchemaOption())
}
