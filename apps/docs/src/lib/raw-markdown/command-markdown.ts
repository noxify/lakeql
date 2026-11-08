import type { CommandProps } from "renoun"

import type { ExecutionMode } from "@/components/mdx/command-client"
import {
  buildCommand,
  buildExecCommand,
  EXECUTION_MODES,
  PACKAGE_MANAGERS,
} from "@/components/mdx/command-strings"

/** Attributes the Markdown `Command` renderer reads. */
export interface CommandAttrs {
  /** The command variant, e.g. `exec`, `create`, `run`, `install`. */
  variant?: string
}

type CommandVariant = NonNullable<CommandProps["variant"]>

const COMMAND_VARIANTS: CommandVariant[] = [
  "create",
  "exec",
  "install",
  "install-dev",
  "run",
]

function isCommandVariant(value: string): value is CommandVariant {
  return (COMMAND_VARIANTS as string[]).includes(value)
}

/** Short comment label describing each `exec` execution-mode group. */
const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  local: "Local (installed as a devDependency)",
  oneoff: "One-off (run without installing)",
}

function fence(lines: string[]): string {
  return ["```bash", ...lines, "```"].join("\n")
}

/**
 * Renders a `<Command>` as a fenced `bash` code block that mirrors the
 * interactive component's axes for the given variant.
 *
 * The command strings are built with the same helpers the React component uses
 * ({@link buildExecCommand}, {@link buildCommand}), so the raw/llms output and
 * the on-page tabs cannot drift. The `exec` variant has two axes (execution
 * mode × package manager) and is grouped by execution mode with comment
 * separators; every other variant has only the package-manager axis and emits a
 * single flat group.
 *
 * @param attrs - The resolved string attributes carrying the variant.
 * @param subject - The command subject text collected from the element's
 *   children (e.g. `lakeql-cli pull --env .env`).
 * @returns The fenced Markdown code block. A variant-less command degrades to a
 *   plain `bash` block of its subject, matching the component's no-variant path.
 */
export async function commandToMarkdown(
  attrs: CommandAttrs,
  subject: string
): Promise<string> {
  const { variant } = attrs

  if (!variant || !isCommandVariant(variant)) {
    return fence([subject])
  }

  if (variant === "exec") {
    const groups = EXECUTION_MODES.map((executionMode) => {
      const commands = PACKAGE_MANAGERS.map((packageManager) =>
        buildExecCommand(packageManager, executionMode, subject)
      )
      return [`# ${EXECUTION_MODE_LABELS[executionMode]}`, ...commands].join(
        "\n"
      )
    })

    return fence([groups.join("\n\n")])
  }

  const commands = PACKAGE_MANAGERS.map((packageManager) =>
    buildCommand(packageManager, variant, subject)
  )

  return fence(commands)
}
