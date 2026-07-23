import "server-only"
import { getCommandConfig } from "@lakeql/cli"

export { getCommandConfig } from "@lakeql/cli"
export type {
  CommandConfig,
  CommandOptionMeta,
  CommandArgumentMeta,
} from "@lakeql/cli"

/**
 * Returns TOC-compatible section entries for a CLI command's options.
 * Options are nested under an "Options" heading.
 *
 * Marked server-only because it imports @lakeql/cli which depends on Node.js packages.
 */
export function getCliCommandTocSections(commandName: string) {
  const config = getCommandConfig(commandName)

  if (config.options.length === 0) {
    return []
  }

  return [
    {
      id: "options",
      title: "Options",
      depth: 2,
      children: config.options.map((opt) => ({
        id: opt.long?.replace("--", "") ?? opt.flags,
        title: opt.flags,
        depth: 3,
      })),
    },
  ]
}
