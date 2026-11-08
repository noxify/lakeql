import "server-only"
import { getCommandConfig } from "@lakeql/cli"
import { getCreateAppCommandConfig } from "@lakeql/create-app/metadata"

export { getCommandConfig } from "@lakeql/cli"
export type {
  CommandConfig,
  CommandOptionMeta,
  CommandArgumentMeta,
} from "@lakeql/cli"

/**
 * Resolves a command's metadata by name.
 *
 * `create-app` lives in `@lakeql/create-app` with its own metadata export, so it
 * is resolved separately from the `@lakeql/cli` commands. This mirrors the
 * resolution in the `CliCommandDetails` component so the table of contents and
 * the rendered details always agree.
 */
function resolveCommandConfig(commandName: string) {
  if (commandName === "create-app") {
    return getCreateAppCommandConfig()
  }
  return getCommandConfig(commandName)
}

/**
 * Returns TOC-compatible section entries for a CLI command's options.
 * Options are nested under an "Options" heading.
 *
 * Marked server-only because it imports @lakeql/cli which depends on Node.js packages.
 */
export function getCliCommandTocSections(commandName: string) {
  const config = resolveCommandConfig(commandName)

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
