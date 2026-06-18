import { z } from "zod/v4"

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

const bulkPullEntrySchema = z
  .object({
    schema: z.string().min(1),
    catalog: z.string().min(1).optional(),
    tables: z.array(z.string().min(1)).optional(),
    views: z.array(z.string().min(1)).optional(),
  })
  .superRefine((entry, ctx) => {
    const hasTables = Array.isArray(entry.tables) && entry.tables.length > 0
    const hasViews = Array.isArray(entry.views) && entry.views.length > 0

    if (!hasTables && !hasViews) {
      ctx.addIssue({
        code: "custom",
        message: "At least one non-empty list is required: tables or views.",
        path: ["tables"],
      })
    }
  })

export const bulkPullConfigSchema = z.array(bulkPullEntrySchema)

export function validateBulkPullConfig(input: unknown): BulkPullConfig {
  return bulkPullConfigSchema.parse(input)
}
