import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { info, success } from "@lakeql/logger/console"
import { confirm } from "@topcli/prompts"

import { resolveSourcePath } from "@/config"
import { CliError, createAbortError } from "@/errors"
import { generateEndpoint } from "@/pipeline/generate"
import {
  ENDPOINT_SCHEMA_VERSION,
  endpointDefinitionSchema,
  findDuplicateFieldNames,
  findReservedNameCollisions,
  isSupportedVersion,
} from "@/pipeline/schema"
import type { FieldDefinition } from "@/pipeline/schema"

import { buildCreateEndpointCommandStructure } from "../metadata/create-endpoint-metadata"

/**
 * Formats a list of field definitions into an indented tree string for display.
 *
 * Example output:
 *   event_id: String
 *   timestamp: DateTime
 *   metadata: Object
 *     source: String
 *     version: Float
 *   tags: Array<String>
 *   dimensions: Array<Object>
 *     key: String
 *     value: String
 */
export function formatFieldTree(fields: FieldDefinition[], indent = 0): string {
  const lines: string[] = []
  const prefix = "  ".repeat(indent + 1)

  for (const field of fields) {
    if (field.type === "Object") {
      lines.push(`${prefix}${field.name}: Object`)
      if (field.fields) {
        lines.push(formatFieldTree(field.fields, indent + 1))
      }
    } else if (field.type === "Array") {
      const itemType = field.items?.type ?? "Unknown"
      lines.push(`${prefix}${field.name}: Array<${itemType}>`)
      if (field.items?.type === "Object" && field.items.fields) {
        lines.push(formatFieldTree(field.items.fields, indent + 1))
      }
    } else {
      lines.push(`${prefix}${field.name}: ${field.type}`)
    }
  }

  return lines.filter((line) => line.length > 0).join("\n")
}

/**
 * Throws the FR5.2 version error (C1/C9/DD6) when the parsed definition's
 * `version` is not the supported `"2.0"` literal. v1 is no longer supported —
 * the write-timestamp partitioning mode became an explicit `autoFill` field.
 *
 * @param parsed - The raw parsed JSON value read from the endpoint file.
 * @param filePath - The source file path, used in the error message.
 * @throws {CliError} When `parsed.version` is not `"2.0"`.
 */
function assertSupportedVersion(parsed: unknown, filePath: string): void {
  const version =
    typeof parsed === "object" && parsed !== null && "version" in parsed
      ? (parsed as { version?: unknown }).version
      : undefined

  if (!isSupportedVersion(version)) {
    throw new CliError(
      `Endpoint definition version ${JSON.stringify(version)} in ${filePath} is not supported. v1 is no longer supported — upgrade to version "${ENDPOINT_SCHEMA_VERSION}". The write-timestamp partitioning mode became an explicit auto-fill field (declare a DateTime field with options.autoFill: "write_timestamp").`,
      {
        code: "ENDPOINT_UNSUPPORTED_VERSION",
      }
    )
  }
}

export default function createEndpointCommand() {
  const program = buildCreateEndpointCommandStructure().action(async (opts) => {
    const { fromFile, sourcePath, skipRegistry: skipReg, force } = opts

    // Resolve the file path relative to cwd
    const filePath = path.isAbsolute(fromFile)
      ? fromFile
      : path.resolve(process.cwd(), fromFile)

    // 1. Check file exists
    if (!existsSync(filePath)) {
      throw new CliError(`File not found: ${filePath}`, {
        code: "ENDPOINT_FILE_NOT_FOUND",
      })
    }

    // Read file content
    let fileContent: string
    try {
      fileContent = await readFile(filePath, "utf-8")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      throw new CliError(`Cannot read file: ${filePath}: ${message}`, {
        code: "ENDPOINT_FILE_READ_FAILED",
        cause: error,
      })
    }

    // Parse JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(fileContent)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      throw new CliError(`Invalid JSON in ${filePath}: ${message}`, {
        code: "ENDPOINT_INVALID_JSON",
        cause: error,
      })
    }

    // Version gate (C1/C9/DD6): reject a v1 (or any non-"2.0") file BEFORE the
    // schema parse so it gets the actionable FR5.2 message rather than a generic
    // "invalid literal" Zod issue.
    assertSupportedVersion(parsed, filePath)

    // Validate against endpointDefinitionSchema
    const result = endpointDefinitionSchema.safeParse(parsed)
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => {
          const issuePath =
            issue.path.length > 0 ? issue.path.join(".") : "root"
          return `  - ${issuePath}: ${issue.message}`
        })
        .join("\n")

      throw new CliError(`Validation failed for ${filePath}.`, {
        code: "ENDPOINT_VALIDATION_FAILED",
        details: [issues],
      })
    }

    const definition = result.data

    // Check for duplicate field names at same nesting level
    const duplicates = findDuplicateFieldNames(definition.fields)
    if (duplicates.length > 0) {
      const details = duplicates
        .map((d) => {
          const location = d.path.length > 0 ? d.path.join(".") : "root"
          return `  - Duplicate field "${d.name}" at level: ${location}`
        })
        .join("\n")

      throw new CliError(`Validation failed for ${filePath}.`, {
        code: "ENDPOINT_DUPLICATE_FIELDS",
        details: [details],
      })
    }

    // Check for reserved-name collisions (C3/C14): a declared field may not take
    // the name of an auto-fill field's derived companion column
    // (`<name>_year`/`<name>_month`). Companions are codegen-local (Option Y),
    // so this derives the reserved set instead of reusing findDuplicateFieldNames.
    const collisions = findReservedNameCollisions(definition.fields)
    if (collisions.length > 0) {
      const details = collisions
        .map(
          (c) =>
            `  - Field "${c.name}" collides with a reserved auto-fill companion column "${c.reservedName}". Rename the field.`
        )
        .join("\n")

      throw new CliError(`Validation failed for ${filePath}.`, {
        code: "ENDPOINT_RESERVED_NAME_COLLISION",
        details: [details],
      })
    }

    // Show summary
    // oxlint-disable-next-line no-console
    console.log(`\n${info("Loaded definition summary:")}`)
    // oxlint-disable-next-line no-console
    console.log(info(`tableName: ${definition.tableName}`))
    // oxlint-disable-next-line no-console
    console.log(info(`catalog: ${definition.catalog}`))
    // oxlint-disable-next-line no-console
    console.log(info(`schema: ${definition.schema}`))
    // oxlint-disable-next-line no-console
    console.log(info(`dataSource: ${definition.dataSource ?? "default"}`))

    // Display mutation configuration status
    const mutationDisplay = definition.mutation
      ? definition.mutation.loadStrategy
      : "disabled"
    // oxlint-disable-next-line no-console
    console.log(info(`mutation: ${mutationDisplay}`))

    // oxlint-disable-next-line no-console
    console.log(`\n${info("Fields:")}`)
    // oxlint-disable-next-line no-console
    console.log(info(formatFieldTree(definition.fields)))
    // oxlint-disable-next-line no-console
    console.log("")

    // Generate files
    const resolvedSourcePath = await resolveSourcePath(
      sourcePath === process.cwd() ? undefined : sourcePath
    )
    const outputDir = path.join(
      resolvedSourcePath,
      "schemas/custom",
      definition.catalog,
      definition.schema,
      definition.tableName
    )

    // Check if output directory already exists
    if (existsSync(outputDir) && !force) {
      const shouldOverwrite = await confirm(
        `Directory "${outputDir}" already exists. Overwrite?`
      )
      if (!shouldOverwrite) {
        throw createAbortError(
          "Aborted: endpoint generation was not confirmed."
        )
      }
    }

    await generateEndpoint({
      definition,
      outputDir,
      skipRegistry: skipReg,
      sourcePathOverride: sourcePath === process.cwd() ? undefined : sourcePath,
      ...(definition.dataSource
        ? { dataSourceName: definition.dataSource }
        : {}),
    })

    // oxlint-disable-next-line no-console
    console.log(success(`Endpoint generated successfully at: ${outputDir}`))
  })

  return program
}
