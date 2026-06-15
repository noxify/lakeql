import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { endpointDefinitionSchema, findDuplicateFieldNames } from "./schema"
import type { EndpointDefinitionFormat } from "./schema"

/**
 * Result of detecting an existing endpoint definition in the output directory.
 */
export interface DetectExistingResult {
  /** Whether the custom-endpoint.json file exists in the directory */
  found: boolean
  /** The parsed and validated definition, if valid */
  definition?: EndpointDefinitionFormat
  /** Error message if the file exists but is corrupted or invalid */
  error?: string
}

/**
 * Detects and loads an existing `custom-endpoint.json` in the given output directory.
 *
 * 1. Checks if `custom-endpoint.json` exists in the directory
 * 2. If it exists: reads, parses JSON, validates against `endpointDefinitionSchema`
 * 3. Also checks for duplicate field names at the same nesting level
 *
 * @param outputDir - The computed output directory to check
 * @returns Detection result with found status, optional definition, and optional error
 */
export async function detectExistingDefinition(
  outputDir: string
): Promise<DetectExistingResult> {
  const filePath = path.join(outputDir, "custom-endpoint.json")

  if (!existsSync(filePath)) {
    return { found: false }
  }

  // File exists — attempt to read
  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { found: true, error: `Cannot read file: ${message}` }
  }

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { found: true, error: `Invalid JSON: ${message}` }
  }

  // Validate against endpointDefinitionSchema
  const result = endpointDefinitionSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const issuePath = issue.path.length > 0 ? issue.path.join(".") : "root"
        return `${issuePath}: ${issue.message}`
      })
      .join("; ")
    return { found: true, error: `Validation failed: ${issues}` }
  }

  const definition = result.data

  // Check for duplicate field names at the same nesting level
  const duplicates = findDuplicateFieldNames(definition.fields)
  if (duplicates.length > 0) {
    const details = duplicates
      .map((d) => {
        const location = d.path.length > 0 ? d.path.join(".") : "root"
        return `"${d.name}" at level: ${location}`
      })
      .join("; ")
    return { found: true, error: `Duplicate field names: ${details}` }
  }

  return { found: true, definition }
}
