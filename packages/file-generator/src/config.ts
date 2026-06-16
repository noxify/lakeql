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
 */
export interface StorageConfigProps {
  /** The load strategy for the write pipeline. */
  loadStrategy: string
  /** Storage adapter type (s3 or minio). */
  type?: string
  /** Bucket name. */
  bucket: string
  /** Base path for endpoint data. */
  basePath: string
  /** Optional region override. */
  region?: string
  /** Optional custom endpoint. */
  endpoint?: string
  /** Partitioning mode (true, false, or field name string). */
  partitioning?: boolean | string
  /** Partition format granularity. */
  partitioningFormat?: string
}

/**
 * Parameters for generateConfig.
 */
export interface GenerateConfigProps {
  /** The Hive catalog name. */
  catalog: string
  /** The Hive schema name. */
  schema: string
  /** The Hive table name. */
  tableName: string
  /** The GraphQL query name for this table. */
  queryName: string
  /** Optional mutation names for this table endpoint. */
  mutationName?: string[]
  /** Optional storage configuration for mutation pipeline. */
  storageConfig?: StorageConfigProps
}

/**
 * Generates config.ts AST nodes for a table endpoint.
 */
export function generateConfig({
  catalog,
  schema,
  tableName,
  queryName,
  mutationName,
  storageConfig,
}: GenerateConfigProps) {
  /**
   * Definition generated via https://ts-ast-viewer.com/
   */

  const hiveConfig = exportedConstStatement(
    "hiveConfig",
    asConst(
      objectLiteral([
        property("catalog", stringLiteral(catalog)),
        property("schema", stringLiteral(schema)),
        property("tableName", stringLiteral(tableName)),
      ])
    )
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

  const nodes: ts.Node[] = [hiveConfig, docsConfig]

  // Generate storageConfig when mutation pipeline is configured
  if (storageConfig) {
    const storageProperties: ts.PropertyAssignment[] = [
      property("loadStrategy", stringLiteral(storageConfig.loadStrategy)),
      property("bucket", stringLiteral(storageConfig.bucket)),
      property("basePath", stringLiteral(storageConfig.basePath)),
    ]

    if (storageConfig.type) {
      storageProperties.push(
        property("type", stringLiteral(storageConfig.type))
      )
    }

    if (storageConfig.region) {
      storageProperties.push(
        property("region", stringLiteral(storageConfig.region))
      )
    }

    if (storageConfig.endpoint) {
      storageProperties.push(
        property("endpoint", stringLiteral(storageConfig.endpoint))
      )
    }

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
