import path from "node:path"

/**
 * Computes the output directory for a generated endpoint following the convention:
 * `<resolvedSourcePath>/schemas/generated/<catalog>/<schema>/<tableName>`
 *
 * @param resolvedSourcePath - The resolved source path (base directory)
 * @param catalog - The catalog name
 * @param schema - The schema name
 * @param tableName - The table name (endpoint identifier)
 * @returns The full output directory path
 */
export function computeOutputDir(
  resolvedSourcePath: string,
  catalog: string,
  schema: string,
  tableName: string
): string {
  return path.join(
    resolvedSourcePath,
    "schemas/generated",
    catalog,
    schema,
    tableName
  )
}
