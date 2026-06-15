import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { Command, Option } from "@commander-js/extra-typings"

import { formatFieldTree } from "@/commands/create-endpoint/format-field-tree"
import { resolveSourcePath } from "@/config"
import { skipRegistry, sourcePathOption } from "@/options"
import { generateEndpoint } from "@/pipeline/generate"
import {
  endpointDefinitionSchema,
  findDuplicateFieldNames,
} from "@/pipeline/schema"

export default function createEndpointCommand() {
  const program = new Command("create-endpoint")
    .description("Create a custom endpoint from a JSON definition file")
    .addOption(
      new Option(
        "--from-file <path>",
        "Path to a JSON definition file conforming to the Endpoint_Definition_Format"
      ).makeOptionMandatory(true)
    )
    .addOption(
      new Option(
        "--no-interactive",
        "Skip all prompts and generate directly (always non-interactive)"
      )
    )
    .addOption(sourcePathOption)
    .addOption(skipRegistry)
    .action(async (opts) => {
      const { fromFile, sourcePath, skipRegistry: skipReg } = opts

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

      // 2. Read file content
      let fileContent: string
      try {
        fileContent = await readFile(filePath, "utf-8")
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // oxlint-disable-next-line no-console
        console.error(`Error: Cannot read file: ${filePath}: ${message}`)
        process.exit(1)
      }

      // 3. Parse JSON
      let parsed: unknown
      try {
        parsed = JSON.parse(fileContent)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // oxlint-disable-next-line no-console
        console.error(`Error: Invalid JSON in ${filePath}: ${message}`)
        process.exit(1)
      }

      // 4. Validate against endpointDefinitionSchema
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

      // 5. Check for duplicate field names at same nesting level
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

      // 6. Show summary
      // oxlint-disable-next-line no-console
      console.log("\nLoaded definition summary:")
      // oxlint-disable-next-line no-console
      console.log(`  tableName: ${definition.tableName}`)
      // oxlint-disable-next-line no-console
      console.log(`  catalog:   ${definition.catalog}`)
      // oxlint-disable-next-line no-console
      console.log(`  schema:    ${definition.schema}`)
      // oxlint-disable-next-line no-console
      console.log("\n  Fields:")
      // oxlint-disable-next-line no-console
      console.log(formatFieldTree(definition.fields))
      // oxlint-disable-next-line no-console
      console.log("")

      // 7. Generate directly (always non-interactive)
      const resolvedSourcePath = resolveSourcePath(
        sourcePath === process.cwd() ? undefined : sourcePath
      )
      const outputDir = path.join(
        resolvedSourcePath,
        "schemas/generated",
        definition.catalog,
        definition.schema,
        definition.tableName
      )

      await generateEndpoint({
        definition,
        outputDir,
        skipRegistry: skipReg,
        sourcePathOverride:
          sourcePath === process.cwd() ? undefined : sourcePath,
      })

      // oxlint-disable-next-line no-console
      console.log(`Endpoint generated successfully at: ${outputDir}`)
    })

  return program
}
