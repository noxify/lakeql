import type { FieldDefinition } from "@lakeql/schema-generator/endpoint-schema"
import {
  endpointDefinitionSchema,
  findDuplicateFieldNames,
} from "@lakeql/schema-generator/endpoint-schema"

import { toDefinition } from "./mapping"
import type { EditorField, EditorState } from "./model"

/**
 * A single schema-level issue, mapped to the responsible editor field when the
 * issue's path resolves to one.
 */
export interface SchemaDiagnostic {
  /** The issue's JSON path within the candidate definition. */
  path: (string | number)[]
  /** Human-readable message from the schema. */
  message: string
  /** The `id` of the editor field the issue resolves to, when any. */
  fieldId?: string
}

/**
 * A duplicate-field-name finding, mapped to the offending field's `id`.
 */
export interface DuplicateDiagnostic {
  /** The duplicated field name. */
  name: string
  /** The nesting path (field names) at which the duplicate occurs. */
  path: string[]
  /** The `id` of the duplicate editor field, when it can be resolved. */
  fieldId?: string
}

/**
 * An unconstructible-regex finding: a `regex` validation whose pattern throws
 * when passed to `new RegExp(pattern)`.
 */
export interface BadRegexDiagnostic {
  /** The offending pattern string. */
  pattern: string
  /** The error thrown while constructing the `RegExp`. */
  message: string
  /** The `id` of the editor field carrying the pattern. */
  fieldId: string
}

/**
 * A non-finite numeric-bound finding: a `min`/`max` validation whose `value` is
 * `NaN` or infinite. The schema's `z.number()` admits these (they are
 * `typeof === "number"`), but `JSON.stringify` serializes them as `null`,
 * producing a file the CLI rejects — so the gate must block it.
 */
export interface BadNumberDiagnostic {
  /** The validation kind carrying the bad value. */
  kind: "min" | "max"
  /** The non-finite value (`NaN` or `±Infinity`). */
  value: number
  /** The `id` of the editor field carrying the bound. */
  fieldId: string
}

/**
 * The result of the "valid for export" gate.
 *
 * `validForExport` is the single boolean the export path consumes. It is the
 * conjunction of a schema parse, the absence of duplicate field names, every
 * `regex` pattern being constructible, and every `min`/`max` bound being a
 * finite number. Each failure kind is reported separately and, where possible,
 * keyed to the editor field `id` so the UI can render inline diagnostics.
 */
export interface ValidationResult {
  /** Whether the current state may be exported. */
  validForExport: boolean
  /** Schema parse issues, empty when the candidate parses. */
  schemaIssues: SchemaDiagnostic[]
  /** Duplicate field names, empty when there are none. */
  duplicates: DuplicateDiagnostic[]
  /** Unconstructible regex patterns, empty when all are constructible. */
  badRegex: BadRegexDiagnostic[]
  /** Non-finite `min`/`max` bounds, empty when every bound is finite. */
  badNumber: BadNumberDiagnostic[]
}

/**
 * Structural shape of the subset of a Zod issue this module reads. Declared
 * locally so the builder does not take a direct dependency on `zod`.
 */
interface ParseIssue {
  path: PropertyKey[]
  message: string
}

/**
 * Walks the editor fields and, for the subset of a definition path that
 * addresses a field, returns that field so a diagnostic can be keyed to its
 * `id`.
 *
 * The candidate definition mirrors the editor tree one-to-one (same field
 * order, same nesting), so a path such as `["fields", 0, "fields", 1]` selects
 * a concrete editor field.
 */
function resolveFieldByPath(
  state: EditorState,
  path: (string | number)[]
): EditorField | undefined {
  // The container currently being indexed. Starts at the top-level fields.
  let fields: EditorField[] | undefined = state.fields
  // The deepest field resolved so far. An issue addressing a field's own
  // children container (e.g. `[..., "fields"]` for an empty Object) keys to
  // this field.
  let current: EditorField | undefined
  let index = 0

  while (index < path.length) {
    const segment = path[index]

    if (segment === "fields") {
      // Descend into the current field's `fields` (or the top-level fields).
      fields =
        current === undefined
          ? state.fields
          : current.type === "Object"
            ? current.fields
            : undefined
      index += 1
      continue
    }

    if (segment === "items") {
      // Descend into the array item's fields.
      fields =
        current?.type === "Array" && current.items?.type === "Object"
          ? current.items.fields
          : undefined
      index += 1
      continue
    }

    if (typeof segment === "number") {
      if (fields === undefined) {
        return current
      }
      current = fields[segment]
      index += 1
      continue
    }

    // Any other segment (e.g. "options", "name") refers to a property of the
    // already-resolved field; stop descending.
    break
  }

  return current
}

/**
 * Collects every `regex` validation pattern in a definition that cannot be
 * compiled with `new RegExp(pattern)`, pairing each with the editor field it
 * came from.
 *
 * Mirrors the editor tree and candidate definition in lockstep so each finding
 * can be keyed to a field `id`.
 */
function collectUnconstructibleRegex(
  editorFields: EditorField[],
  defFields: FieldDefinition[]
): BadRegexDiagnostic[] {
  const findings: BadRegexDiagnostic[] = []

  const walk = (editors: EditorField[], defs: FieldDefinition[]): void => {
    for (const [i, def] of defs.entries()) {
      const editor = editors[i]
      if (editor === undefined) {
        continue
      }

      for (const validation of def.options?.validations ?? []) {
        if (validation.type !== "regex") {
          continue
        }
        try {
          // Construct exactly as the CLI does — `new RegExp(pattern)` with no
          // flags — so this constructibility check matches the generated code.
          // The `u` flag is intentionally omitted for that parity.
          // eslint-disable-next-line no-new, require-unicode-regexp
          new RegExp(validation.pattern)
        } catch (error) {
          findings.push({
            pattern: validation.pattern,
            message: error instanceof Error ? error.message : String(error),
            fieldId: editor.id,
          })
        }
      }

      if (def.type === "Object" && def.fields !== undefined) {
        walk(editor.fields ?? [], def.fields)
      } else if (
        def.type === "Array" &&
        def.items?.type === "Object" &&
        def.items.fields !== undefined
      ) {
        walk(editor.items?.fields ?? [], def.items.fields)
      }
    }
  }

  walk(editorFields, defFields)
  return findings
}

/**
 * Collects every `min`/`max` validation whose numeric `value` is not finite
 * (`NaN` or `±Infinity`), pairing each with the editor field it came from.
 *
 * The schema's `z.number()` accepts these values, but exporting them through
 * `JSON.stringify` emits `null`, which the CLI then rejects on import. Keying
 * the finding to the field `id` lets the UI surface it inline, and counting it
 * against the gate keeps the "valid for export ⇒ CLI-consumable" guarantee.
 *
 * Mirrors the editor tree and candidate definition in lockstep, exactly as
 * {@link collectUnconstructibleRegex} does.
 */
function collectNonFiniteNumericBounds(
  editorFields: EditorField[],
  defFields: FieldDefinition[]
): BadNumberDiagnostic[] {
  const findings: BadNumberDiagnostic[] = []

  const walk = (editors: EditorField[], defs: FieldDefinition[]): void => {
    for (const [i, def] of defs.entries()) {
      const editor = editors[i]
      if (editor === undefined) {
        continue
      }

      for (const validation of def.options?.validations ?? []) {
        if (validation.type !== "min" && validation.type !== "max") {
          continue
        }
        if (!Number.isFinite(validation.value)) {
          findings.push({
            kind: validation.type,
            value: validation.value,
            fieldId: editor.id,
          })
        }
      }

      if (def.type === "Object" && def.fields !== undefined) {
        walk(editor.fields ?? [], def.fields)
      } else if (
        def.type === "Array" &&
        def.items?.type === "Object" &&
        def.items.fields !== undefined
      ) {
        walk(editor.items?.fields ?? [], def.items.fields)
      }
    }
  }

  walk(editorFields, defFields)
  return findings
}

/**
 * Resolves the editor field that owns a given duplicate finding so the
 * diagnostic can carry its `id`. The finding's `path` is a list of field names;
 * the duplicate is the second occurrence of `name` at that level.
 */
function resolveDuplicateField(
  state: EditorState,
  name: string,
  path: string[]
): string | undefined {
  let fields: EditorField[] | undefined = state.fields

  for (const segment of path) {
    const parent: EditorField | undefined = fields?.find(
      (field) => field.name === segment
    )
    if (parent === undefined) {
      return undefined
    }
    fields =
      parent.type === "Object"
        ? parent.fields
        : parent.type === "Array" && parent.items?.type === "Object"
          ? parent.items.fields
          : undefined
  }

  if (fields === undefined) {
    return undefined
  }

  // The duplicate is the second (and later) field sharing `name` at this level.
  let seen = false
  for (const field of fields) {
    if (field.name === name) {
      if (seen) {
        return field.id
      }
      seen = true
    }
  }
  return undefined
}

/**
 * Evaluates the "valid for export" gate for the current editor state.
 *
 * Builds the candidate definition via {@link toDefinition}, then composes the
 * three checks in order: a parse against `endpointDefinitionSchema`, the
 * duplicate-field-name check (`findDuplicateFieldNames`, which the schema does
 * not itself enforce), regex constructibility (each `regex` pattern must
 * survive `new RegExp(pattern)`, matching how the CLI emits it), and numeric
 * finiteness (each `min`/`max` bound must be a finite number, since `NaN`
 * serializes to `null` and the CLI would then reject it). The definition is
 * valid for export only when all four pass.
 *
 * @param state - The live editor state to evaluate.
 * @returns A {@link ValidationResult} with the gate result and field-keyed
 *   diagnostics.
 */
export function evaluate(state: EditorState): ValidationResult {
  const candidate = toDefinition(state)

  const parsed = endpointDefinitionSchema.safeParse(candidate)
  const schemaIssues: SchemaDiagnostic[] = parsed.success
    ? []
    : (parsed.error.issues as ParseIssue[]).map((issue) => {
        const path = issue.path.map((segment) =>
          typeof segment === "number" ? segment : String(segment)
        )
        const field = resolveFieldByPath(state, path)
        return {
          path,
          message: issue.message,
          ...(field === undefined ? {} : { fieldId: field.id }),
        }
      })

  const duplicates: DuplicateDiagnostic[] = findDuplicateFieldNames(
    candidate.fields
  ).map((duplicate) => {
    const fieldId = resolveDuplicateField(state, duplicate.name, duplicate.path)
    return {
      name: duplicate.name,
      path: duplicate.path,
      ...(fieldId === undefined ? {} : { fieldId }),
    }
  })

  const badRegex = collectUnconstructibleRegex(state.fields, candidate.fields)

  const badNumber = collectNonFiniteNumericBounds(
    state.fields,
    candidate.fields
  )

  const validForExport =
    parsed.success &&
    duplicates.length === 0 &&
    badRegex.length === 0 &&
    badNumber.length === 0

  return { validForExport, schemaIssues, duplicates, badRegex, badNumber }
}

/**
 * Convenience predicate over {@link evaluate}: whether the state may be
 * exported.
 *
 * @param state - The live editor state.
 * @returns `true` when the state is valid for export.
 */
export function isValidForExport(state: EditorState): boolean {
  return evaluate(state).validForExport
}
