import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { confirm } from "@topcli/prompts"

import { resolveSourcePath } from "@/config"
import { generateEndpoint } from "@/pipeline/generate"
import {
  endpointDefinitionSchema,
  findDuplicateFieldNames,
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

export default function createEndpointCommand() {
  const program = buildCreateEndpointCommandStructure().action(async (opts) => {
    const { fromFile, sourcePath, skipRegistry: skipReg, force } = opts

    // Resolve the file path relative to cwd
    const filePath = path.isAbsolute(fromFile)
      ? fromFile
      : path.resolve(process.cwd(), fromFile)

    // 1. Check file exists
    if (!existsSync(filePath)) {
      // oxlint-disable-next-line no-console
      console.error(`Error: File not found: ${filePath}`)
      process.exit(1)
    }

    // Read file content
    let fileContent: string
    try {
      fileContent = await readFile(filePath, "utf-8")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      // oxlint-disable-next-line no-console
      console.error(`Error: Cannot read file: ${filePath}: ${message}`)
      process.exit(1)
    }

    // Parse JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(fileContent)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      // oxlint-disable-next-line no-console
      console.error(`Error: Invalid JSON in ${filePath}: ${message}`)
      process.exit(1)
    }

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
      // oxlint-disable-next-line no-console
      console.error(`Error: Validation failed for ${filePath}:\n${issues}`)
      process.exit(1)
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
      // oxlint-disable-next-line no-console
      console.error(`Error: Validation failed for ${filePath}:\n${details}`)
      process.exit(1)
    }

    // Show summary
    // oxlint-disable-next-line no-console
    console.log("\nLoaded definition summary:")
    // oxlint-disable-next-line no-console
    console.log(`  tableName: ${definition.tableName}`)
    // oxlint-disable-next-line no-console
    console.log(`  catalog:   ${definition.catalog}`)
    // oxlint-disable-next-line no-console
    console.log(`  schema:    ${definition.schema}`)

    // Display mutation configuration status
    const mutationDisplay = definition.mutation
      ? definition.mutation.loadStrategy
      : "disabled"
    // oxlint-disable-next-line no-console
    console.log(`  mutation:  ${mutationDisplay}`)

    // oxlint-disable-next-line no-console
    console.log("\n  Fields:")
    // oxlint-disable-next-line no-console
    console.log(formatFieldTree(definition.fields))
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
        // oxlint-disable-next-line no-console
        console.log("Aborted.")
        process.exit(0)
      }
    }

    await generateEndpoint({
      definition,
      outputDir,
      skipRegistry: skipReg,
      sourcePathOverride: sourcePath === process.cwd() ? undefined : sourcePath,
    })

    // oxlint-disable-next-line no-console
    console.log(`Endpoint generated successfully at: ${outputDir}`)
  })

  return program
}
