/**
 * The metadata leaves that map to a real, focusable input in the Settings
 * view, so a validation issue keyed to one can be navigated to (jump-to-field).
 *
 * `tableName`/`catalog`/`schema`/`dataSource` are inputs in the metadata form;
 * `basePath` is the input in the mutation-config form (only rendered when
 * mutation is enabled, which is also the only state in which a `basePath` issue
 * can exist). `partitioning` is the partition picker's input in the same form,
 * rendered while "By field / custom format" is active — the only state in which
 * a partitioning issue can exist. `version` is intentionally excluded — it is a
 * read-only literal with no editable input, so its issue stays
 * shown-but-not-clickable.
 */
export type MetadataNavKey =
  | "tableName"
  | "catalog"
  | "schema"
  | "dataSource"
  | "basePath"
  | "partitioning"

/** The set of navigable metadata keys, for the {@link isMetadataNavKey} guard. */
const METADATA_NAV_KEYS: ReadonlySet<string> = new Set<MetadataNavKey>([
  "tableName",
  "catalog",
  "schema",
  "dataSource",
  "basePath",
  "partitioning",
])

/**
 * Whether a metadata path leaf names an input the Settings view can focus.
 *
 * Returns `false` for `version` (no editable input) and for any unknown leaf,
 * so only leaves with a known, stable focus target are treated as navigable.
 *
 * @param leaf - The metadata path leaf (e.g. the last string segment of a
 *   schema diagnostic's path), or `undefined` when none resolved.
 * @returns `true` when `leaf` is a {@link MetadataNavKey}.
 */
export function isMetadataNavKey(
  leaf: string | undefined
): leaf is MetadataNavKey {
  return leaf !== undefined && METADATA_NAV_KEYS.has(leaf)
}

/**
 * The stable DOM id for a navigable metadata input, shared by the Settings
 * forms (which apply it to the `<input>` and its label's `htmlFor`) and the
 * Validations jump (which resolves the element by this id to move focus).
 *
 * Deterministic and collision-free (prefixed), so it replaces the forms'
 * `useId()` ids for exactly these inputs without the Validations view needing
 * to know each form's internal id scheme.
 *
 * @param key - The navigable metadata key.
 * @returns The stable element id for that key's input.
 */
export function metadataInputId(key: MetadataNavKey): string {
  return `metadata-nav-${key}`
}
