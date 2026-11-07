import path from "node:path"
import { pathToFileURL } from "node:url"

import { globby } from "globby"

import { builder } from "./builder"

export interface SchemaLoadOptions {
  baseDir?: string
  schemaPath?: string
}

/**
 * Thrown by {@link loadSchema} when no generated schema files are found under
 * the resolved schema directory.
 *
 * This is an expected configuration state (for example, a freshly scaffolded
 * project before the first pull), not an internal failure. Consumers can catch
 * it to print a concise message instead of a stack trace.
 */
export class SchemaFilesNotFoundError extends Error {
  override readonly name = "SchemaFilesNotFoundError"

  /** The resolved absolute directory that was searched. */
  readonly schemaDir: string

  /**
   * @param schemaDir - The resolved absolute directory that was searched.
   */
  constructor(schemaDir: string) {
    super(
      `No schema files found under '${schemaDir}'.\n` +
        `Generate them from your data sources first by running the pull command ` +
        `(e.g. \`lakeql pull\` / \`pnpm cli pull\`), then start the server again. ` +
        `If your schemas live elsewhere, set 'schemaPath' in defineApiConfig to point at them.\n` +
        `Checked patterns: schemas/**/{query,mutation}-schema.{ts,js,mjs} and **/{query,mutation}-schema.{ts,js,mjs}`
    )
    this.schemaDir = schemaDir
  }
}

const schemaCache = new Map<
  string,
  Promise<ReturnType<typeof builder.toSchema>>
>()

function resolveSchemaDir({ baseDir, schemaPath }: SchemaLoadOptions = {}) {
  const base = baseDir ?? process.cwd()

  // No schemaPath → look in the consumer's base directory. (Never
  // import.meta.dirname, which points inside the installed @lakeql/api
  // package and can only ever yield SchemaFilesNotFoundError.)
  if (!schemaPath) {
    return base
  }

  if (path.isAbsolute(schemaPath)) {
    return schemaPath
  }

  return path.resolve(base, schemaPath)
}

async function buildSchema(schemaDir: string) {
  const schemaFiles = await globby(
    [
      "schemas/**/query-schema.{ts,js,mjs}",
      "schemas/**/mutation-schema.{ts,js,mjs}",
      "**/query-schema.{ts,js,mjs}",
      "**/mutation-schema.{ts,js,mjs}",
    ],
    {
      absolute: true,
      cwd: schemaDir,
      onlyFiles: true,
    }
  )

  const uniqueSchemaFiles = [...new Set(schemaFiles)]

  if (uniqueSchemaFiles.length === 0) {
    throw new SchemaFilesNotFoundError(schemaDir)
  }

  const hasMutationSchemas = uniqueSchemaFiles.some((f) =>
    f.includes("mutation-schema")
  )

  // Register mutationType only when mutation schema files exist.
  // Pothos requires at least one field on a type — registering mutationType
  // without any mutationFields causes "Type Mutation must define one or more fields".
  if (hasMutationSchemas) {
    builder.mutationType({})
  }

  for (const filePath of uniqueSchemaFiles) {
    // oxlint-disable-next-line no-await-in-loop
    await import(pathToFileURL(filePath).href)
  }

  return builder.toSchema()
}

export async function loadSchema(options: SchemaLoadOptions = {}) {
  const schemaDir = resolveSchemaDir(options)

  if (!schemaCache.has(schemaDir)) {
    schemaCache.set(schemaDir, buildSchema(schemaDir))
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return schemaCache.get(schemaDir)!
}
