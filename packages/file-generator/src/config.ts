import type { AdapterName } from "@lakeql/datasource"
import ts from "typescript"

import {
  asConst,
  exportedConstStatement,
  objectLiteral,
  property,
  stringLiteral,
} from "./ast-builders"

/**
 * Storage configuration for the mutation write pipeline.
 * Only contains per-endpoint concerns — infrastructure fields (bucket, type, region, endpoint)
 * are now part of the DataSource storage config.
 */
export interface StorageConfigProps {
  /** The load strategy for the write pipeline. */
  loadStrategy: string
  /** Base path for endpoint data. */
  basePath: string
  /** Partitioning mode (true, false, or field name string). */
  partitioning?: boolean | string
  /** Partition format granularity. */
  partitioningFormat?: string
}

/**
 * Parameters for generateConfig.
 */
export interface GenerateConfigProps {
  /** The adapter type for this endpoint. */
  adapter: AdapterName
  /** The DataSource name referencing a configured DataSource. */
  dataSourceName: string
  /** The catalog name. */
  catalog?: string
  /** The schema name. */
  schema?: string
  /** The table name. */
  tableName: string
  /** The GraphQL query name for this table. */
  queryName: string
  /** Optional mutation names for this table endpoint. */
  mutationName?: string[]
  /** Optional storage configuration for mutation pipeline. */
  storageConfig?: StorageConfigProps
}

/**
 * Generates the adapter-specific sourceConfig properties based on the adapter type.
 */
function buildSourceConfigProperties(
  props: GenerateConfigProps
): ts.PropertyAssignment[] {
  const { adapter, dataSourceName, tableName } = props

  const baseProperties: ts.PropertyAssignment[] = [
    property("dataSource", stringLiteral(dataSourceName)),
    property("adapter", stringLiteral(adapter)),
  ]

  if (!props.catalog || !props.schema) {
    throw new Error(
      `${adapter} adapter requires catalog and schema in generateConfig`
    )
  }

  return [
    ...baseProperties,
    property("catalog", stringLiteral(props.catalog)),
    property("schema", stringLiteral(props.schema)),
    property("tableName", stringLiteral(tableName)),
  ]
}

/**
 * Generates config.ts AST nodes for a table endpoint.
 * Outputs a `sourceConfig` discriminated union (replaces `hiveConfig`).
 */
export function generateConfig(props: GenerateConfigProps) {
  const { queryName, mutationName, storageConfig } = props

  const sourceConfig = exportedConstStatement(
    "sourceConfig",
    asConst(objectLiteral(buildSourceConfigProperties(props)))
  )

  const docsConfig = exportedConstStatement(
    "docsConfig",
    objectLiteral([
      property("query", ts.factory.createTrue()),
      property(
        "mutation",
        mutationName?.length
          ? ts.factory.createTrue()
          : ts.factory.createFalse()
      ),
      property("queryName", stringLiteral(queryName)),
      property(
        "mutationName",
        mutationName?.length
          ? ts.factory.createArrayLiteralExpression(
              mutationName.map((name) => stringLiteral(name)),
              false
            )
          : ts.factory.createNull()
      ),
    ])
  )

  const nodes: ts.Node[] = [sourceConfig, docsConfig]

  // Generate storageConfig when mutation pipeline is configured
  if (storageConfig) {
    const storageProperties: ts.PropertyAssignment[] = [
      property("loadStrategy", stringLiteral(storageConfig.loadStrategy)),
      property("basePath", stringLiteral(storageConfig.basePath)),
    ]

    if (storageConfig.partitioning !== undefined) {
      if (typeof storageConfig.partitioning === "boolean") {
        storageProperties.push(
          property(
            "partitioning",
            storageConfig.partitioning
              ? ts.factory.createTrue()
              : ts.factory.createFalse()
          )
        )
      } else {
        storageProperties.push(
          property("partitioning", stringLiteral(storageConfig.partitioning))
        )
      }
    }

    if (storageConfig.partitioningFormat) {
      storageProperties.push(
        property(
          "partitioningFormat",
          stringLiteral(storageConfig.partitioningFormat)
        )
      )
    }

    const storageConfigNode = exportedConstStatement(
      "storageConfig",
      asConst(objectLiteral(storageProperties))
    )

    nodes.push(storageConfigNode)
  }

  // Return the nodes directly - the generateCode function will handle formatting
  return nodes
}
