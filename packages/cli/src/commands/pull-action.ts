// oxlint-disable no-await-in-loop
import path from "node:path"

import { parseColumns } from "@lakeql/column-parser"
import type { DataSource } from "@lakeql/datasource"

import { columnsToDefinition } from "@/pipeline/columns-to-definition"
import { generateEndpoint } from "@/pipeline/generate"

export interface PullActionParams {
  dataSource: DataSource
  dataSourceName: string
  catalog: string
  schema: string
  tables: string[]
  resolvedTargetPath: string
  skipRegistry: boolean
  sourcePathOverride?: string
  onItemStart?: (itemName: string) => void
  onItemFinish?: (itemName: string, success: boolean) => void
}

/**
 * Core pull logic — fetches columns from the data source and generates endpoints.
 * Shared by both interactive `pull` and `bulk-pull` flows.
 */
export async function executePull(params: PullActionParams): Promise<void> {
  const {
    dataSource,
    dataSourceName,
    catalog,
    schema,
    tables,
    resolvedTargetPath,
    skipRegistry,
    sourcePathOverride,
    onItemStart,
    onItemFinish,
  } = params

  // oxlint-disable-next-line no-unreachable-loop
  for (const table of tables) {
    let succeeded = false
    onItemStart?.(table)

    try {
      const columnInfos = await dataSource.columns(catalog, schema, table)

      // Convert ColumnInfo[] to the Record<string, JSONType> expected by parseColumns.
      // ColumnInfo has { name, type, extra?, description? }. The column parser
      // expects { name: string; type: string } with the native type string.
      const columnRecords = columnInfos.map((col) => ({
        name: col.name,
        type: col.type,
        extra: col.extra ?? "",
        description: col.description ?? "",
      }))

      const parsedColumns = parseColumns(columnRecords)

      const definition = columnsToDefinition({
        tableName: table,
        catalog,
        schema,
        parsedColumns,
        typeMapper: dataSource.typeMapper,
      })

      const targetPath = path.join(
        resolvedTargetPath,
        "schemas/generated",
        dataSourceName,
        catalog,
        schema,
        table
      )

      await generateEndpoint({
        definition,
        outputDir: targetPath,
        skipRegistry,
        sourcePathOverride,
        adapter: dataSource.adapter,
        dataSourceName,
      })

      succeeded = true
    } finally {
      onItemFinish?.(table, succeeded)
    }
  }
}
