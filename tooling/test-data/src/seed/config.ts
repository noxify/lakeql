/**
 * Seed configuration types and helpers.
 *
 * Each seed definition describes a target (schema + table + connector)
 * and provides columns + a generate function. Template datasets export
 * these as reusable building blocks.
 */

export type ConnectorType = "hive" | "clickhouse"

export interface ColumnDefinition {
  /** Column name in Trino */
  name: string
  /** Trino column type (e.g. "VARCHAR", "BIGINT", "DOUBLE", "TIMESTAMP(3)") */
  type: string
}

/**
 * A seed definition. Every definition has the same shape —
 * whether it uses a built-in template or defines custom logic.
 */
export interface SeedDefinition {
  /** Unique name for this definition (used with --definition flag) */
  name: string
  /** Trino schema to create/use */
  schema: string
  /** Trino table name */
  table: string
  /** Connector type determining the seed strategy */
  connector: ConnectorType
  /** Column definitions (Trino types) for CREATE TABLE */
  columns: ColumnDefinition[]
  /**
   * Generator function: writes a Parquet file to targetDir and returns the file path.
   * @param amount - Number of records to generate
   * @param targetDir - Directory to write the Parquet file into
   * @returns Path to the generated Parquet file
   */
  generate: (amount: number, targetDir: string) => Promise<string>
}

/**
 * Type-safe helper for defining seed configurations.
 *
 * @example
 * ```ts
 * import { defineSeeds } from "./src/seed/config"
 * import { simpleColumns, simpleGenerate } from "./src/datasets/simple"
 *
 * export default defineSeeds([
 *   {
 *     name: "products",
 *     schema: "test",
 *     table: "products",
 *     connector: "hive",
 *     columns: simpleColumns,
 *     generate: simpleGenerate,
 *   },
 * ])
 * ```
 */
export function defineSeeds(definitions: SeedDefinition[]): SeedDefinition[] {
  return definitions
}
