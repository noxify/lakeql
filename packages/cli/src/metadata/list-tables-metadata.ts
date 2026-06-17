/**
 * List tables command metadata — only the command structure, no action handlers.
 */
import { Command } from "@commander-js/extra-typings"

import { createCatalogOption, createSchemaOption } from "@/options"

export function buildListTablesCommandStructure() {
  const program = new Command("list-tables")
  return program
    .description("Lists the available tables for the configured catalog/schema")
    .addOption(createCatalogOption())
    .addOption(createSchemaOption())
}
