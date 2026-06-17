/**
 * List columns command metadata — only the command structure, no action handlers.
 */
import { Command } from "@commander-js/extra-typings"

import { catalogOption, schemaOption, tableOption } from "@/options"

export function buildListColumnsCommandStructure() {
  const program = new Command("list-columns")
  return program
    .description("Lists the columns for the specified table")
    .addOption(catalogOption)
    .addOption(schemaOption.makeOptionMandatory())
    .addOption(tableOption.makeOptionMandatory())
}
