/**
 * Configuration for a single pull entry in a bulk import.
 */
export interface BulkPullEntry {
  /** The schema to pull from. */
  schema: string
  /** Optional catalog override. Falls back to CLI --catalog or ENV. */
  catalog?: string
  /** List of tables to pull. */
  tables?: string[]
  /** List of views to pull. */
  views?: string[]
}

/**
 * Bulk pull configuration — a simple array of pull entries.
 *
 * @example
 * ```js
 * // import.config.mjs
 * /** @type {import('@lakeql/cli').BulkPullConfig} *\/
 * export default [
 *   { schema: "schema1", tables: ["table1", "table2"] },
 *   { schema: "schema2", catalog: "other", views: ["view1"] },
 * ]
 * ```
 */
export type BulkPullConfig = BulkPullEntry[]
