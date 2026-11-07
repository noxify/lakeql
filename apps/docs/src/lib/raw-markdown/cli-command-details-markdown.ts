import type { CommandConfig, CommandOptionMeta } from "@lakeql/cli"
import { getCommandConfig } from "@lakeql/cli"
import { getCreateAppCommandConfig } from "@lakeql/create-app/metadata"

import { tableCell } from "./mdast-helpers"

/** String-literal attributes the Markdown `CliCommandDetails` renderer reads. */
export interface CliCommandDetailsAttrs {
  /** The command name, e.g. `pull`, `list-tables`, `create-app`. */
  command: string
}

const INLINE_CODE = (value: string): string => `\`${value}\``

function resolveConfig(command: string): CommandConfig {
  return command === "create-app"
    ? getCreateAppCommandConfig()
    : getCommandConfig(command)
}

/**
 * Formats an option's default for display, identical to the React
 * `cli-command-details` component: `defaultValueDescription` wins, `undefined`
 * and `null` yield no row, an empty array becomes `[]`, and everything else is
 * JSON-stringified.
 */
function formatDefault(opt: CommandOptionMeta): string | null {
  if (opt.defaultValueDescription) {
    return opt.defaultValueDescription
  }
  if (opt.defaultValue === undefined || opt.defaultValue === null) {
    return null
  }
  if (Array.isArray(opt.defaultValue) && opt.defaultValue.length === 0) {
    return "[]"
  }
  return JSON.stringify(opt.defaultValue)
}

function renderArguments(config: CommandConfig): string[] {
  if (config.arguments.length === 0) {
    return []
  }

  const lines: string[] = [
    "#### Arguments",
    "",
    "| Name | Description | Required |",
    "| --- | --- | --- |",
  ]

  for (const arg of config.arguments) {
    const name = `${arg.required ? `<${arg.name}>` : `[${arg.name}]`}${arg.variadic ? "..." : ""}`
    lines.push(
      `| ${tableCell(INLINE_CODE(name))} | ${tableCell(arg.description)} | ${arg.required ? "Yes" : "No"} |`
    )
  }

  return lines
}

function renderOption(opt: CommandOptionMeta): string[] {
  const lines: string[] = [`#### ${INLINE_CODE(opt.flags)}`]

  if (opt.description) {
    lines.push("", opt.description.trim())
  }

  lines.push(
    "",
    "| Property | Value |",
    "| --- | --- |",
    `| Type | ${INLINE_CODE(opt.isBoolean ? "boolean" : "string")} |`
  )

  if (opt.choices && opt.choices.length > 0) {
    const choices = opt.choices.map((c) => INLINE_CODE(c)).join(", ")
    lines.push(`| Choices | ${tableCell(choices)} |`)
  }

  lines.push(`| Required | ${opt.required ? "Yes" : "No"} |`)

  const defaultDisplay = formatDefault(opt)
  if (defaultDisplay !== null) {
    lines.push(`| Default | ${tableCell(INLINE_CODE(defaultDisplay))} |`)
  }

  if (opt.envVar) {
    lines.push(`| Env var | ${tableCell(INLINE_CODE(opt.envVar))} |`)
  }

  return lines
}

/**
 * Renders a CLI command's arguments and options as Markdown, mirroring the
 * React `CliCommandDetails` component.
 *
 * Resolution reuses the same metadata source as the component
 * (`getCommandConfig`, or `getCreateAppCommandConfig` for `create-app`), so the
 * two never diverge. Descriptions are emitted as plain text — `escapeMdxText`
 * is deliberately not applied — so tokens like `import.config.{mjs,ts,js,json}`
 * survive intact.
 *
 * @param attrs - The resolved string attributes carrying the command name.
 * @returns The command's Markdown, or a one-line fallback note when the command
 *   cannot be resolved.
 */
export async function cliCommandDetailsToMarkdown(
  attrs: CliCommandDetailsAttrs
): Promise<string> {
  let config: CommandConfig

  try {
    config = resolveConfig(attrs.command)
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[raw-markdown] CliCommandDetails expansion failed for command "${attrs.command}":`,
      error
    )
    return `> Documentation for \`CliCommandDetails\` could not be generated.`
  }

  const sections: string[][] = []

  const argumentsSection = renderArguments(config)
  if (argumentsSection.length > 0) {
    sections.push(argumentsSection)
  }

  for (const opt of config.options) {
    sections.push(renderOption(opt))
  }

  return sections.map((section) => section.join("\n")).join("\n\n")
}
