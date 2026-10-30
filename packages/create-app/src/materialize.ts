/**
 * create-app materializer helpers.
 *
 * File writing (`materializeFiles`/`WriteMode`) now lives in
 * `@lakeql/scaffold`; create-app imports it from there. The data-source name
 * validation below is create-app prompt logic and stays local.
 */

/**
 * Ensure all data source name values are unique.
 * Throws if two adapters map to the same name.
 */
export function ensureUniqueValues(dsNames: Record<string, string>): void {
  const seen = new Map<string, string>()
  for (const [adapterId, dsName] of Object.entries(dsNames)) {
    const existing = seen.get(dsName)
    if (existing) {
      throw new Error(
        `Data source name "${dsName}" used by both "${existing}" and "${adapterId}".`
      )
    }
    seen.set(dsName, adapterId)
  }
}
