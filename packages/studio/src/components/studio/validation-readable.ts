import type {
  AutoFillMutationDiagnostic,
  AutoFillPlacementDiagnostic,
  BadNumberDiagnostic,
  BadRegexDiagnostic,
  CompanionPartitionDiagnostic,
  DuplicateDiagnostic,
  EditorState,
  ReservedNameDiagnostic,
  SchemaDiagnostic,
  ValidationResult,
} from "@/core"
import { fieldNamePath } from "@/core"

import type { MetadataNavKey } from "./metadata-nav"
import { isMetadataNavKey } from "./metadata-nav"

/**
 * A single validity-gate diagnostic reformatted for on-screen presentation: a
 * human-readable field label, a rule-level message, and whether the entry can
 * be navigated to a concrete field.
 *
 * `toReadableIssues` derives these from the same {@link ValidationResult} the
 * rest of the UI consumes, so a readable list and the flat count the announcer
 * reports (via `summarizeDiagnostics`) are always two views of one source — they
 * cannot diverge.
 */
export interface ReadableIssue {
  /** A stable key for list rendering, unique within one result. */
  id: string
  /**
   * The id of the field the issue resolves to, when it is a field-navigation
   * target. Present for a navigable field issue; mutually exclusive with
   * {@link ReadableIssue.metadataKey}.
   */
  fieldId?: string
  /**
   * The navigable metadata input the issue resolves to, when it is a
   * metadata-navigation target (e.g. an invalid `tableName`). Present for a
   * navigable metadata issue; mutually exclusive with
   * {@link ReadableIssue.fieldId}. Absent for a non-navigable metadata leaf
   * such as `version`.
   */
  metadataKey?: MetadataNavKey
  /**
   * The field and its ancestry as a breadcrumb label (e.g.
   * `"address › postalCode"`), or a metadata field name for a non-field issue.
   */
  label: string
  /** The rule-level wording describing what is wrong (not the raw Zod text). */
  message: string
  /**
   * Whether the entry resolves to a target a UI can navigate to: `true` when a
   * resolvable {@link ReadableIssue.fieldId} (a field) or a
   * {@link ReadableIssue.metadataKey} (a Settings input) is present.
   */
  navigable: boolean
}

/** The breadcrumb separator shown between ancestry names in a label. */
const LABEL_SEPARATOR = " › "

/** The placeholder shown for a field whose name is still empty. */
const UNNAMED_FIELD = "(unnamed field)"

/** The label shown when no field context can be resolved at all. */
const DEFINITION_LABEL = "Definition"

/**
 * Renders an ancestry of field names as a breadcrumb label, substituting a
 * placeholder for any still-empty name so an unnamed field is never a blank
 * crumb.
 */
function labelFromNames(names: string[]): string {
  if (names.length === 0) {
    return DEFINITION_LABEL
  }
  return names
    .map((name) => (name === "" ? UNNAMED_FIELD : name))
    .join(LABEL_SEPARATOR)
}

/**
 * Resolves a field-keyed diagnostic to a breadcrumb label via
 * {@link fieldNamePath}, falling back to the {@link DEFINITION_LABEL} when the
 * id no longer resolves (a stale diagnostic against a removed field).
 */
function fieldLabel(state: EditorState, fieldId: string): string {
  const names = fieldNamePath(state, fieldId)
  return names === undefined ? DEFINITION_LABEL : labelFromNames(names)
}

/**
 * Human-readable labels for the top-level metadata keys, so a non-field
 * (metadata) issue reads "Table name" rather than the raw path leaf `tableName`.
 */
const METADATA_LEAF_LABELS: Record<string, string> = {
  tableName: "Table name",
  catalog: "Catalog",
  schema: "Schema",
  dataSource: "Data source",
  basePath: "Base path",
  version: "Version",
}

/**
 * Renders a non-field (metadata) issue's label from its path leaf: a known
 * metadata key gets its human-readable name, anything else falls back to the
 * leaf itself or the {@link DEFINITION_LABEL}.
 */
function metadataLabel(leaf: string | undefined): string {
  if (leaf === undefined) {
    return DEFINITION_LABEL
  }
  return METADATA_LEAF_LABELS[leaf] ?? leaf
}

/** The last string segment of a Zod issue path, or `undefined` when none. */
function pathLeaf(path: (string | number)[]): string | undefined {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const segment = path[index]
    if (typeof segment === "string") {
      return segment
    }
  }
  return undefined
}

/**
 * Infers the rule-level wording for a schema issue from its path leaf, so the
 * UI shows a stable sentence rather than the raw Zod message. Falls back to the
 * schema's own message for a leaf without a known mapping.
 */
function schemaMessage(issue: SchemaDiagnostic): string {
  const leaf = pathLeaf(issue.path)
  switch (leaf) {
    case "name": {
      return "Field name is invalid"
    }
    case "tableName": {
      return "Table name is invalid"
    }
    case "catalog": {
      return "Catalog is invalid"
    }
    case "schema": {
      return "Schema is invalid"
    }
    case "dataSource": {
      return "Data source is invalid"
    }
    case "basePath": {
      return "Base path is invalid"
    }
    default: {
      return issue.message
    }
  }
}

/**
 * Maps a schema diagnostic to a {@link ReadableIssue}.
 *
 * A field-keyed issue resolves to a navigable field (`fieldId`). A metadata
 * violation (no `fieldId`) is navigable when its path leaf names a focusable
 * Settings input (see {@link isMetadataNavKey}) — it then carries a
 * `metadataKey` the Validations jump focuses. A metadata leaf with no editable
 * input (e.g. `version`) stays shown-but-not-navigable.
 */
function fromSchema(
  state: EditorState,
  issue: SchemaDiagnostic,
  index: number
): ReadableIssue {
  const message = schemaMessage(issue)
  if (issue.fieldId === undefined) {
    const leaf = pathLeaf(issue.path)
    if (isMetadataNavKey(leaf)) {
      return {
        id: `schema-${index}`,
        metadataKey: leaf,
        label: metadataLabel(leaf),
        message,
        navigable: true,
      }
    }
    return {
      id: `schema-${index}`,
      label: metadataLabel(leaf),
      message,
      navigable: false,
    }
  }
  return {
    id: `schema-${index}`,
    fieldId: issue.fieldId,
    label: fieldLabel(state, issue.fieldId),
    message,
    navigable: true,
  }
}

/**
 * Maps a duplicate-name diagnostic to a {@link ReadableIssue}. The finding's
 * `path` is already field names, so the breadcrumb is built directly from it
 * plus the duplicated `name`; navigable when the offending field id resolved.
 */
function fromDuplicate(
  duplicate: DuplicateDiagnostic,
  index: number
): ReadableIssue {
  const label = labelFromNames([...duplicate.path, duplicate.name])
  const message = "Duplicate field name at this level"
  if (duplicate.fieldId === undefined) {
    return { id: `duplicate-${index}`, label, message, navigable: false }
  }
  return {
    id: `duplicate-${index}`,
    fieldId: duplicate.fieldId,
    label,
    message,
    navigable: true,
  }
}

/**
 * Maps an unconstructible-regex diagnostic to a navigable {@link ReadableIssue}
 * (its `fieldId` is always present).
 */
function fromBadRegex(
  state: EditorState,
  bad: BadRegexDiagnostic,
  index: number
): ReadableIssue {
  return {
    id: `regex-${index}`,
    fieldId: bad.fieldId,
    label: fieldLabel(state, bad.fieldId),
    message: "Validation pattern is not a valid regular expression",
    navigable: true,
  }
}

/**
 * Maps a non-finite numeric-bound diagnostic to a navigable
 * {@link ReadableIssue} (its `fieldId` is always present).
 */
function fromBadNumber(
  state: EditorState,
  bad: BadNumberDiagnostic,
  index: number
): ReadableIssue {
  return {
    id: `number-${index}`,
    fieldId: bad.fieldId,
    label: fieldLabel(state, bad.fieldId),
    message: `${bad.kind} bound is not a finite number`,
    navigable: true,
  }
}

/**
 * Maps a reserved-name collision (C3/C14) to a {@link ReadableIssue}, navigable
 * when the colliding field id resolved.
 */
function fromReservedName(
  state: EditorState,
  collision: ReservedNameDiagnostic,
  index: number
): ReadableIssue {
  const message = `Name "${collision.name}" collides with an auto-fill field's reserved column name`
  if (collision.fieldId === undefined) {
    return {
      id: `reserved-${index}`,
      label: labelFromNames([collision.name]),
      message,
      navigable: false,
    }
  }
  return {
    id: `reserved-${index}`,
    fieldId: collision.fieldId,
    label: fieldLabel(state, collision.fieldId),
    message,
    navigable: true,
  }
}

/**
 * Maps an invalid auto-fill placement (C12/C13/C17) to a {@link ReadableIssue}.
 */
function fromAutoFillPlacement(
  state: EditorState,
  bad: AutoFillPlacementDiagnostic,
  index: number
): ReadableIssue {
  const message =
    bad.reason === "non-datetime"
      ? "Auto-fill is only valid on a DateTime field"
      : "Auto-fill is only valid on a top-level field, not a nested one"
  if (bad.fieldId === undefined) {
    return {
      id: `autofill-placement-${index}`,
      label: labelFromNames([bad.name]),
      message,
      navigable: false,
    }
  }
  return {
    id: `autofill-placement-${index}`,
    fieldId: bad.fieldId,
    label: fieldLabel(state, bad.fieldId),
    message,
    navigable: true,
  }
}

/**
 * Maps an auto-fill-without-compatible-mutation finding (C11/C16) to a
 * {@link ReadableIssue}.
 */
function fromAutoFillMutation(
  state: EditorState,
  bad: AutoFillMutationDiagnostic,
  index: number
): ReadableIssue {
  const message = bad.mutationEnabled
    ? "Auto-fill requires an append or full-load-append mutation"
    : "Auto-fill requires an enabled append or full-load-append mutation"
  if (bad.fieldId === undefined) {
    return {
      id: `autofill-mutation-${index}`,
      label: labelFromNames([bad.name]),
      message,
      navigable: false,
    }
  }
  return {
    id: `autofill-mutation-${index}`,
    fieldId: bad.fieldId,
    label: fieldLabel(state, bad.fieldId),
    message,
    navigable: true,
  }
}

/**
 * Maps a companion-column partition-segment finding (C15/FR6.3) to a
 * non-navigable {@link ReadableIssue} (the target is the partition string, not
 * a field).
 */
function fromCompanionPartition(
  bad: CompanionPartitionDiagnostic,
  index: number
): ReadableIssue {
  return {
    id: `companion-partition-${index}`,
    label: "Partitioning",
    message: `Partition segment "${bad.segment}" references the derived column "${bad.companionName}"; use "${bad.primaryName}:year" instead`,
    navigable: false,
  }
}

/**
 * Drops duplicate-name findings whose field name is still the empty string.
 *
 * Two not-yet-named fields share the empty-string name `""`, so the core gate's
 * `findDuplicateFieldNames` reports them as duplicates. But an empty-named field
 * already surfaces a "Field name is invalid" schema issue, so showing the
 * duplicate finding too double-signals the same not-yet-filled-in state. This
 * display-layer filter suppresses only that redundant readable issue; the core
 * gate is unchanged, so two empty-named fields remain non-exportable via their
 * invalid-name schema issues.
 */
function withoutEmptyNameDuplicates(
  duplicates: DuplicateDiagnostic[]
): DuplicateDiagnostic[] {
  return duplicates.filter((duplicate) => duplicate.name !== "")
}

/**
 * Reformats every validity-gate diagnostic into a readable, optionally-navigable
 * entry for the Validations summary and per-field details.
 *
 * Each diagnostic kind maps to a {@link ReadableIssue}: schema, regex, and
 * numeric-bound issues resolve their `fieldId` to a name/ancestry breadcrumb via
 * {@link fieldNamePath}; a duplicate issue uses its already-name `path` directly.
 * A metadata violation (no `fieldId`, such as an invalid `tableName`) is still
 * returned; it is navigable via a `metadataKey` when its leaf names a focusable
 * Settings input, and non-navigable otherwise (e.g. `version`), in which case it
 * is shown in the summary but not a clickable jump target.
 *
 * This is a pure reformatting of what `evaluate()` already returns — not a second
 * validation path and not a replacement for `summarizeDiagnostics` (which stays
 * the flat count/line source for the announcer and the import/export bar). Both
 * derive from the same {@link ValidationResult}. No DOM, no React.
 *
 * A duplicate-name finding for an empty-named field is suppressed here (see
 * {@link withoutEmptyNameDuplicates}): such a field already surfaces a "Field
 * name is invalid" schema issue, so the duplicate entry would only double-signal
 * the same not-yet-named state. This is display-only; the core export gate still
 * counts those fields as invalid.
 *
 * @param state - The live editor state, used to resolve field-keyed labels.
 * @param result - The validity-gate result to reformat.
 * @returns The readable issues in a stable order: schema, duplicate, regex, then
 *   numeric-bound.
 */
export function toReadableIssues(
  state: EditorState,
  result: ValidationResult
): ReadableIssue[] {
  return [
    ...result.schemaIssues.map((issue, index) =>
      fromSchema(state, issue, index)
    ),
    ...withoutEmptyNameDuplicates(result.duplicates).map((duplicate, index) =>
      fromDuplicate(duplicate, index)
    ),
    ...result.badRegex.map((bad, index) => fromBadRegex(state, bad, index)),
    ...result.badNumber.map((bad, index) => fromBadNumber(state, bad, index)),
    ...result.reservedNames.map((collision, index) =>
      fromReservedName(state, collision, index)
    ),
    ...result.autoFillPlacement.map((bad, index) =>
      fromAutoFillPlacement(state, bad, index)
    ),
    ...result.autoFillMutation.map((bad, index) =>
      fromAutoFillMutation(state, bad, index)
    ),
    ...result.companionPartition.map((bad, index) =>
      fromCompanionPartition(bad, index)
    ),
  ]
}

/**
 * Collects the set of field ids that any diagnostic in `result` keys to, so a
 * canvas node can cheaply answer "do I have a validation issue?" against the
 * live gate result. Derived from the same {@link ValidationResult} the summary
 * uses, so a node badge and the summary entry for a field cannot disagree.
 *
 * @param result - The validity-gate result to scan.
 * @returns A set of field ids carrying at least one issue.
 */
export function fieldIdsWithIssues(result: ValidationResult): Set<string> {
  const ids = new Set<string>()
  for (const issue of result.schemaIssues) {
    if (issue.fieldId !== undefined) {
      ids.add(issue.fieldId)
    }
  }
  for (const duplicate of withoutEmptyNameDuplicates(result.duplicates)) {
    if (duplicate.fieldId !== undefined) {
      ids.add(duplicate.fieldId)
    }
  }
  for (const bad of result.badRegex) {
    ids.add(bad.fieldId)
  }
  for (const bad of result.badNumber) {
    ids.add(bad.fieldId)
  }
  for (const collision of result.reservedNames) {
    if (collision.fieldId !== undefined) {
      ids.add(collision.fieldId)
    }
  }
  for (const bad of result.autoFillPlacement) {
    if (bad.fieldId !== undefined) {
      ids.add(bad.fieldId)
    }
  }
  for (const bad of result.autoFillMutation) {
    if (bad.fieldId !== undefined) {
      ids.add(bad.fieldId)
    }
  }
  return ids
}

/**
 * The readable issues that resolve to a specific field, for the field
 * properties panel's per-field detail list.
 *
 * @param state - The live editor state, used to resolve labels.
 * @param result - The validity-gate result to reformat.
 * @param fieldId - The field whose issues to return.
 * @returns The subset of {@link toReadableIssues} whose `fieldId` matches.
 */
export function readableIssuesForField(
  state: EditorState,
  result: ValidationResult,
  fieldId: string
): ReadableIssue[] {
  return toReadableIssues(state, result).filter(
    (issue) => issue.fieldId === fieldId
  )
}
