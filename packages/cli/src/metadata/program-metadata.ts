/**
 * Root program metadata — the top-level `lakeql-cli` command structure and its
 * global options, with no action handlers. Built as a structure (like each
 * command's `build*CommandStructure`) so documentation can extract the global
 * options the same way it extracts per-command options.
 */
import { Command } from "@commander-js/extra-typings"

import { createEnvOption } from "@/options"

/**
 * Builds the root program structure with its global options.
 *
 * The runtime attaches subcommands and action handlers on top of this; the docs
 * pipeline reads the global options from the returned command.
 */
export function buildProgramStructure() {
  return new Command("lakeql-cli")
    .description("LakeQL CLI")
    .addOption(createEnvOption())
}
