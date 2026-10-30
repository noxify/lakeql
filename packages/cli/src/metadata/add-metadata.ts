/**
 * Add command metadata — only the command structure, no action handlers.
 */
import { Command, Option } from "@commander-js/extra-typings"

export function buildAddCommandStructure() {
  return new Command("add")
    .description("Apply a named feature template to the current LakeQL project")
    .argument("<feature>", "Id of the feature template to apply")
    .addOption(
      new Option(
        "--dry-run",
        "Preview all changes (auto-applied writes and guidance) without touching disk"
      ).default(false)
    )
}
