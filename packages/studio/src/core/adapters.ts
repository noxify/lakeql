import type { WriteMethod } from "@lakeql/schema-generator/endpoint-schema"

/**
 * The adapters the editor knows about. The list mirrors the adapters offered
 * by `create-app`; only the ones whose profile is `available` can be selected.
 */
export type EditorAdapterId = "trino" | "fabric" | "clickhouse" | "duckdb"

/**
 * What the editor offers for one adapter. The profile steers which controls
 * are shown, hidden or prefilled. It never reaches the exported definition:
 * the endpoint schema stays adapter-neutral.
 */
export interface EditorAdapterProfile {
  /** The adapter's identifier. */
  id: EditorAdapterId
  /** Display name. */
  label: string
  /** Whether the adapter can be selected in the editor today. */
  available: boolean
  /** Why an unavailable adapter is disabled, shown next to its name. */
  unavailableHint?: string
  /**
   * The write methods the adapter supports. The write method control is only
   * shown when there is more than one to choose from.
   */
  writeMethods: readonly WriteMethod[]
}

/**
 * Every adapter the editor lists, in display order.
 */
export const EDITOR_ADAPTERS: readonly EditorAdapterProfile[] = [
  {
    id: "trino",
    label: "Trino",
    available: true,
    writeMethods: ["storage", "insert"],
  },
  {
    id: "fabric",
    label: "Microsoft Fabric",
    available: false,
    unavailableHint: "not supported yet",
    writeMethods: [],
  },
  {
    id: "clickhouse",
    label: "ClickHouse",
    available: false,
    unavailableHint: "coming soon",
    writeMethods: [],
  },
  {
    id: "duckdb",
    label: "DuckDB",
    available: false,
    unavailableHint: "coming soon",
    writeMethods: [],
  },
]

/**
 * The adapter selected in a fresh editor.
 */
export const DEFAULT_EDITOR_ADAPTER: EditorAdapterId = "trino"

/**
 * Looks up an adapter's profile.
 *
 * @param id - The adapter identifier.
 * @returns The adapter's profile.
 */
export function adapterProfile(id: EditorAdapterId): EditorAdapterProfile {
  const profile = EDITOR_ADAPTERS.find((entry) => entry.id === id)
  if (profile === undefined) {
    throw new Error(`Unknown editor adapter "${id}"`)
  }
  return profile
}
