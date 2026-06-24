import fs from "node:fs/promises"

import type { TrinoClient } from "@lakeql/trino-client"
import { Files } from "files-sdk"
import { s3 } from "files-sdk/s3"

import type { ColumnDefinition, ConnectorType } from "./config"
import { MINITRINO } from "./defaults"

/**
 * Interface for seed connectors.
 * Each connector knows how to provision schema, upload data, and create tables
 * for its specific backend.
 */
export interface SeedConnector {
  type: ConnectorType

  /** Ensures the Trino schema exists (connector-specific DDL). */
  ensureSchema: (catalog: string, schema: string) => Promise<void>

  /**
   * Executes a full seed cycle for one definition:
   * Drop existing table → Delete existing data → Upload new data → Create table
   */
  seed: (props: {
    catalog: string
    schema: string
    table: string
    columns: ColumnDefinition[]
    parquetFilePath: string
  }) => Promise<void>
}

/**
 * Creates a Hive seed connector that:
 * - Creates schemas with S3 location
 * - Uploads Parquet files to MinIO
 * - Creates external tables pointing to the uploaded data
 */
export function createHiveSeedConnector(client: TrinoClient): SeedConnector {
  const { bucket, endpoint, region, credentials } = MINITRINO.minio

  const files = new Files({
    adapter: s3({
      bucket,
      region,
      endpoint,
      credentials,
      forcePathStyle: true,
    }),
  })

  return {
    type: "hive",

    async ensureSchema(catalog: string, schema: string): Promise<void> {
      await client.query({
        sql: `CREATE SCHEMA IF NOT EXISTS ${catalog}.${schema} WITH (location = 's3a://${bucket}/${schema}')`,
      })
    },

    async seed({ catalog, schema, table, columns, parquetFilePath }) {
      const s3Prefix = `${schema}/${table}/`
      const s3Target = `${s3Prefix}data.parquet`

      // 1. Drop existing table
      await client.dropTable({ catalog, schema, table })

      // 2. Delete existing data in MinIO prefix
      const existingKeys: string[] = []
      for await (const file of files.listAll({ prefix: s3Prefix })) {
        existingKeys.push(file.key)
      }
      if (existingKeys.length > 0) {
        await files.delete(existingKeys)
      }

      // 3. Upload new Parquet file from disk
      const fileBuffer = await fs.readFile(parquetFilePath)
      await files.upload(s3Target, fileBuffer)

      // 4. Create table pointing to the uploaded data
      const columnDefs = columns
        .map(({ name, type }) => `${name} ${type}`)
        .join(",\n  ")

      await client.query({
        sql: `CREATE TABLE ${catalog}.${schema}.${table} (\n  ${columnDefs}\n)\nWITH (\n  external_location = 's3a://${bucket}/${s3Prefix}',\n  format = 'PARQUET'\n)`,
      })
    },
  }
}

/**
 * ClickHouse connector stub — not yet implemented.
 * The interface is prepared for future implementation.
 */
export function createClickHouseSeedConnector(): SeedConnector {
  return {
    type: "clickhouse",

    ensureSchema(): Promise<void> {
      throw new Error(
        "ClickHouse connector is not yet implemented. " +
          "Contributions welcome — see .kiro/specs/seed-command/design.md for the planned flow."
      )
    },

    seed(): Promise<void> {
      throw new Error(
        "ClickHouse connector is not yet implemented. " +
          "Contributions welcome — see .kiro/specs/seed-command/design.md for the planned flow."
      )
    },
  }
}

/**
 * Factory: creates the appropriate seed connector for the given type.
 */
export function createSeedConnector(
  type: ConnectorType,
  client: TrinoClient
): SeedConnector {
  switch (type) {
    case "hive": {
      return createHiveSeedConnector(client)
    }
    case "clickhouse": {
      return createClickHouseSeedConnector()
    }
    default: {
      throw new Error(`Unknown connector type: ${type}`)
    }
  }
}
