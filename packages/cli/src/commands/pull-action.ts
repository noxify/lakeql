// oxlint-disable no-await-in-loop
import path from "node:path"

import { parseColumns } from "@lakeql/column-parser"
import { convertTrinoResponse } from "@lakeql/response-transformer"
import type { TrinoClient } from "@lakeql/trino-client"

import { generateEndpoint } from "@/pipeline/generate"
import { trinoColumnsToDefinition } from "@/pipeline/trino-to-definition"

export interface PullActionParams {
  trinoClient: TrinoClient
  catalog: string
  schema: string
  tables: string[]
  resolvedTargetPath: string
  skipRegistry: boolean
  sourcePathOverride?: string
}

/**
 * Core pull logic — fetches columns from Trino and generates endpoints.
 * Shared by both interactive `pull` and `bulk-pull` flows.
 */
export async function executePull(params: PullActionParams): Promise<void> {
  const {
    trinoClient,
    catalog,
    schema,
    tables,
    resolvedTargetPath,
    skipRegistry,
    sourcePathOverride,
  } = params

  for (const table of tables) {
    const columns = await trinoClient.columns({
      catalog,
      schema,
      table,
    })

    const transformedResponse = columns.map((values) =>
      convertTrinoResponse<{
        name: string
        type: string
        extra: string
        description: string
      }>({
        keys: ["name", "type", "extra", "description"],
        values,
      })
    )

    const parsedColumns = parseColumns(transformedResponse)

    const definition = trinoColumnsToDefinition({
      tableName: table,
      catalog,
      schema,
      parsedColumns,
    })

    const targetPath = path.join(
      resolvedTargetPath,
      "schemas/generated",
      catalog,
      schema,
      table
    )

    await generateEndpoint({
      definition,
      outputDir: targetPath,
      skipRegistry,
      sourcePathOverride,
    })
  }
}
