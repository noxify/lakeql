/**
 * List tables command metadata — only the command structure, no action handlers.
 */
import { buildListObjectsCommandStructure } from "./list-objects-metadata"

export function buildListTablesCommandStructure() {
  return buildListObjectsCommandStructure(
    "list-tables",
    "Lists the available tables for the configured catalog/schema"
  )
}
