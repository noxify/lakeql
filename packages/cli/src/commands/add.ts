import { bullet, dim, heading, success } from "@lakeql/logger/console"
import type { FeatureContext, FeatureInput } from "@lakeql/scaffold"
import {
  applyFeature,
  InvalidProjectError,
  resolveFeatureTemplate,
  UnknownFeatureError,
} from "@lakeql/scaffold"
import { question, validators } from "@topcli/prompts"
import { readPackage } from "read-pkg"

import { CliError } from "@/errors"
import { highlightTsLine, wrapText } from "@/output-format"
import { getInvocationCwd } from "@/path-utils"

import { buildAddCommandStructure } from "../metadata/add-metadata"

/* oxlint-disable no-console */

/** Print a line to stdout. */
function println(line = ""): void {
  console.log(line)
}

/**
 * Print the auto-applied changes as a bullet list under a heading. Each change
 * is a single short line, so no further structure is needed.
 */
function printChanges(changes: string[]): void {
  if (changes.length === 0) {
    return
  }

  println()
  println(heading("Changes"))
  for (const change of changes) {
    println(`  ${bullet(change)}`)
  }
}

/** Visible width of a step's number prefix, e.g. " 1. " — kept fixed so prose
 * and wrapped continuation lines align. */
const STEP_PREFIX_WIDTH = 4

/**
 * Print the follow-up steps as a numbered list under a heading. A step's first
 * line is prose (word-wrapped to the terminal, continuation lines aligned under
 * the text); any following lines are an embedded code snippet, set off by a
 * blank line and syntax highlighted so the prose and the code to paste read
 * distinctly. A blank line separates steps for breathing room.
 */
function printNextSteps(steps: string[]): void {
  if (steps.length === 0) {
    return
  }

  println()
  println(heading("Next steps"))

  for (const [index, step] of steps.entries()) {
    if (index > 0) {
      println()
    }

    const [first, ...codeLines] = step.split("\n")
    const number = dim(
      `${`${index + 1}.`.padStart(STEP_PREFIX_WIDTH - 1, " ")} `
    )
    const wrapped = wrapText(first ?? "", STEP_PREFIX_WIDTH)
    println(`${number}${wrapped[0] ?? ""}`)
    for (const continuation of wrapped.slice(1)) {
      println(continuation)
    }

    // Set the code block off from the prose with a blank line, then print each
    // snippet line highlighted and indented under the step.
    if (codeLines.length > 0) {
      println()
      for (const codeLine of codeLines) {
        println(`      ${highlightTsLine(codeLine.trimStart())}`)
      }
    }
  }
}

/**
 * Resolve a template's declared inputs from CLI flags, falling back to an
 * interactive prompt when attached to a TTY. A required input left unresolved
 * in a non-interactive run is a `CliError`, so nothing is written.
 */
async function resolveInputs(
  inputs: readonly FeatureInput[],
  flagValues: Record<string, string | undefined>,
  interactive: boolean
): Promise<Record<string, string | undefined>> {
  const resolved: Record<string, string | undefined> = {}

  for (const input of inputs) {
    const fromFlag = flagValues[input.flag]
    if (fromFlag !== undefined) {
      resolved[input.id] = fromFlag
      continue
    }

    if (interactive) {
      // eslint-disable-next-line no-await-in-loop
      const answer = await question(input.prompt, {
        validators: input.required ? [validators.required()] : [],
      })
      const trimmed = answer.trim()
      resolved[input.id] = trimmed.length > 0 ? trimmed : undefined
      continue
    }

    if (input.required) {
      throw new CliError(
        `Missing required input "${input.flag}" for this feature.`,
        {
          code: "ADD_MISSING_INPUT",
          hint: `Pass --${input.flag} <value> or run in an interactive terminal.`,
        }
      )
    }

    resolved[input.id] = undefined
  }

  return resolved
}

export default function addCommand() {
  const program = buildAddCommandStructure().action(async (feature, opts) => {
    // Map scaffold-level errors to CliErrors at this boundary so the package
    // stays free of a reverse dependency on @lakeql/cli.
    let template: ReturnType<typeof resolveFeatureTemplate>
    try {
      template = resolveFeatureTemplate(feature)
    } catch (error) {
      if (error instanceof UnknownFeatureError) {
        throw new CliError(error.message, {
          code: "ADD_UNKNOWN_FEATURE",
          hint: "Run with one of the listed feature ids.",
        })
      }
      throw error
    }

    const projectDir = getInvocationCwd()

    // Read the project's package.json — the only project file `add` inspects.
    // It never loads lakeql.config.ts, so applying a feature never triggers the
    // project's env or adapter validation.
    let packageJson: FeatureContext["packageJson"]
    try {
      packageJson = (await readPackage({
        cwd: projectDir,
      })) as FeatureContext["packageJson"]
    } catch (error) {
      throw new CliError(
        `No package.json found in ${projectDir}; not a valid project.`,
        {
          code: "ADD_INVALID_PROJECT",
          hint: "Run `lakeql add` from the root of a LakeQL project.",
          cause: error,
        }
      )
    }

    // Resolve the feature's declared inputs from flags (non-interactive) or
    // prompts (interactive TTY).
    const interactive = Boolean(process.stdout.isTTY) && !opts.dryRun
    const flagValues = opts as unknown as Record<string, string | undefined>
    const inputs = await resolveInputs(
      template.inputs ?? [],
      flagValues,
      interactive
    )

    const ctx: FeatureContext = { projectDir, packageJson, inputs }

    // Preconditions throw an actionable error when the project is unfit; map it
    // to a CliError so nothing is written for an unmet precondition (R4).
    try {
      template.checkPreconditions(ctx)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new CliError(message, {
        code: "ADD_PRECONDITION_FAILED",
        cause: error,
      })
    }

    const result = template.build(ctx)

    let outcome: ReturnType<typeof applyFeature>
    try {
      outcome = applyFeature(result, {
        projectDir,
        mode: opts.dryRun ? "dry-run" : "write",
      })
    } catch (error) {
      if (error instanceof InvalidProjectError) {
        throw new CliError(error.message, {
          code: "ADD_INVALID_PROJECT",
          hint: "Run `lakeql add` from the root of a valid LakeQL project.",
          cause: error,
        })
      }
      throw error
    }

    const summary = opts.dryRun
      ? `Previewing feature "${feature}" (dry run; no files written)`
      : `Applied feature "${feature}"`
    println(success(summary))

    printChanges(outcome.applied)
    printNextSteps(outcome.guidance)
  })

  return program
}
