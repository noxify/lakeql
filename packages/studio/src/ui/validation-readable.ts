import type {
  BadNumberDiagnostic,
  BadRegexDiagnostic,
  DuplicateDiagnostic,
  EditorState,
  SchemaDiagnostic,
  ValidationResult,
} from "@/core"
import { fieldNamePath } from "@/core"

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
   * The id of the field the issue resolves to, when any. Present exactly when
   * {@link ReadableIssue.navigable} is `true`.
   */
  fieldId?: string
  /**
   * The field and its ancestry as a breadcrumb label (e.g.
   * `"address › postalCode"`), or a metadata field name for a non-field issue.
   */
  label: string
  /** The rule-level wording describing what is wrong (not the raw Zod text). */
  message: string
  /** Whether the entry resolves to a field a UI can select and focus. */
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
 * Maps a schema diagnostic to a {@link ReadableIssue}. Navigable only when the
 * issue resolved to a field id; a metadata violation (no `fieldId`) is shown
 * with its leaf-derived label but is not clickable.
 */
function fromSchema(
  state: EditorState,
  issue: SchemaDiagnostic,
  index: number
): ReadableIssue {
  const message = schemaMessage(issue)
  if (issue.fieldId === undefined) {
    const leaf = pathLeaf(issue.path)
    return {
      id: `schema-${index}`,
      label: leaf ?? DEFINITION_LABEL,
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
    message: `${bad.kind === "min" ? "min" : "max"} bound is not a finite number`,
    navigable: true,
  }
}

/**
 * Reformats every validity-gate diagnostic into a readable, optionally-navigable
 * entry for the Validations summary and per-field details.
 *
 * Each diagnostic kind maps to a {@link ReadableIssue}: schema, regex, and
 * numeric-bound issues resolve their `fieldId` to a name/ancestry breadcrumb via
 * {@link fieldNamePath}; a duplicate issue uses its already-name `path` directly.
 * An issue with no `fieldId` (a metadata violation such as an invalid
 * `tableName`) is still returned, with `navigable: false`, so it is shown in the
 * summary but not presented as a clickable jump target.
 *
 * This is a pure reformatting of what `evaluate()` already returns — not a second
 * validation path and not a replacement for `summarizeDiagnostics` (which stays
 * the flat count/line source for the announcer and the import/export bar). Both
 * derive from the same {@link ValidationResult}. No DOM, no React.
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
    ...result.duplicates.map((duplicate, index) =>
      fromDuplicate(duplicate, index)
    ),
    ...result.badRegex.map((bad, index) => fromBadRegex(state, bad, index)),
    ...result.badNumber.map((bad, index) => fromBadNumber(state, bad, index)),
  ]
}
