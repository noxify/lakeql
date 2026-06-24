import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { SeedDefinition } from "./config"
import type { SeedConnector } from "./connectors"
import { MINITRINO } from "./defaults"

const TMPDIR = path.join(os.tmpdir(), "lakeql-seed")

export interface SeedOptions {
  /** Number of records to generate */
  amount: number
}

export interface SeedResult {
  name: string
  success: boolean
  error?: string
}

/**
 * Seeds a single definition: generate → ensureSchema → upload + create table.
 */
export async function seedDefinition(
  definition: SeedDefinition,
  connector: SeedConnector,
  options: SeedOptions
): Promise<void> {
  const catalog = MINITRINO.trino.catalog
  const { schema, table, columns, generate } = definition

  // Prepare tmpdir
  const targetDir = path.join(TMPDIR, definition.name)
  await fs.mkdir(targetDir, { recursive: true })

  try {
    // 1. Generate Parquet file on disk
    const parquetFilePath = await generate(options.amount, targetDir)

    // 2. Ensure schema exists
    await connector.ensureSchema(catalog, schema)

    // 3. Seed: drop → delete → upload → create
    await connector.seed({
      catalog,
      schema,
      table,
      columns,
      parquetFilePath,
    })
  } finally {
    // Cleanup tmp files (best-effort)
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Seeds multiple definitions (best-effort). Returns results for each.
 */
export async function seedAll(
  definitions: SeedDefinition[],
  connector: SeedConnector,
  options: SeedOptions,
  onProgress?: (
    name: string,
    status: "start" | "done" | "error",
    error?: string
  ) => void
): Promise<SeedResult[]> {
  const results: SeedResult[] = []

  for (const definition of definitions) {
    onProgress?.(definition.name, "start")

    try {
      // oxlint-disable-next-line no-await-in-loop
      await seedDefinition(definition, connector, options)
      results.push({ name: definition.name, success: true })
      onProgress?.(definition.name, "done")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ name: definition.name, success: false, error: message })
      onProgress?.(definition.name, "error", message)
    }
  }

  return results
}
