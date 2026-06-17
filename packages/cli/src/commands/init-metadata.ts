/**
 * Init command metadata — only the command structure, no action handlers.
 */
import { Command } from "@commander-js/extra-typings"

export function buildInitCommandStructure() {
  return new Command("init").description("Initialize a lakeql config file")
}
