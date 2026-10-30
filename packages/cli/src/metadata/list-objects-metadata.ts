/**
 * Shared command-structure factory for the `list-tables` and `list-views`
 * commands, which differ only in their name and description.
 */
import { Command } from "@commander-js/extra-typings"

import {
  createCatalogOption,
  createDataSourceOption,
  createSchemaOption,
} from "@/options"

/**
 * Builds the command structure (name, description, options) shared by the
 * object-listing commands, without any action handler.
 *
 * @param name - The command name (e.g. `"list-tables"`).
 * @param description - The one-line command description.
 * @returns The configured Commander command.
 */
export function buildListObjectsCommandStructure(
  name: string,
  description: string
) {
  const program = new Command(name)
  return program
    .description(description)
    .addOption(createDataSourceOption())
    .addOption(createCatalogOption())
    .addOption(createSchemaOption())
}
