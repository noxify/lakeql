/**
 * List views command metadata — only the command structure, no action handlers.
 */
import { buildListObjectsCommandStructure } from "./list-objects-metadata"

export function buildListViewsCommandStructure() {
  return buildListObjectsCommandStructure(
    "list-views",
    "Lists the available views for the configured catalog/schema"
  )
}
