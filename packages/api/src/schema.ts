import path from "node:path"
import { pathToFileURL } from "node:url"

import { globby } from "globby"

import { builder } from "./builder"

export interface SchemaLoadOptions {
  baseDir?: string
  schemaPath?: string
}

const defaultSchemaDir = import.meta.dirname
const schemaCache = new Map<
  string,
  Promise<ReturnType<typeof builder.toSchema>>
>()

function resolveSchemaDir({ baseDir, schemaPath }: SchemaLoadOptions = {}) {
  if (!schemaPath) {
    return defaultSchemaDir
  }

  if (path.isAbsolute(schemaPath)) {
    return schemaPath
  }

  return path.resolve(baseDir ?? process.cwd(), schemaPath)
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
    throw new Error(
      `No schema files found for schemaPath '${schemaDir}'. Checked patterns: schemas/**/{query,mutation}-schema.{ts,js,mjs} and **/{query,mutation}-schema.{ts,js,mjs}`
    )
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
