import type { FieldDefinition } from "@lakeql/schema-generator/endpoint-schema"
import {
  autoFillCompanionNames,
  endpointDefinitionSchema,
  findDuplicateFieldNames,
  findReservedNameCollisions,
  validatePartitioningFormat,
} from "@lakeql/schema-generator/endpoint-schema"

import { toDefinition } from "./mapping"
import type { EditorField, EditorState } from "./model"
import {
  isResolvedPartitionSegment,
  serializePartitionSegments,
} from "./partitioning"

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
 * A reserved-name collision: a declared top-level field whose name equals an
 * auto-fill field's own name or one of its derived companion columns
 * (`<name>_year`/`<name>_month`). Mirrors
 * `findReservedNameCollisions` (C3/C14) — under Option Y the companions are
 * computed, never stored, so a plain duplicate check cannot catch them.
 */
export interface ReservedNameDiagnostic {
  /** The colliding declared field's name. */
  name: string
  /** The `id` of the colliding editor field, when it resolves. */
  fieldId?: string
}

/**
 * An invalid `autoFill` placement: `autoFill` is only valid on a top-level
 * `DateTime` field (C12/C13/C17). This finding covers a non-`DateTime`
 * auto-fill field and an auto-fill field nested at any depth inside an `Object`
 * or an `Array`-of-`Object`.
 */
export interface AutoFillPlacementDiagnostic {
  /** The offending field's name. */
  name: string
  /** Why the placement is invalid. */
  reason: "non-datetime" | "nested"
  /** The `id` of the offending editor field, when it resolves. */
  fieldId?: string
}

/**
 * An `autoFill` field without a compatible enabled mutation: `autoFill`
 * requires an enabled `append`/`full_load_append` mutation (C11/C16).
 * `full_load` and a disabled/absent mutation are both invalid.
 */
export interface AutoFillMutationDiagnostic {
  /** The auto-fill field's name. */
  name: string
  /** Whether a mutation is enabled at all (distinguishes the two messages). */
  mutationEnabled: boolean
  /** The `id` of the auto-fill editor field, when it resolves. */
  fieldId?: string
}

/**
 * A partition-string segment that references a derived companion column
 * (`<name>_year`/`<name>_month`) in any form (C15/FR6.3). Companion columns are
 * categorically not a partition source; the author should use the primary
 * field's component form (`<name>:year`).
 */
export interface CompanionPartitionDiagnostic {
  /** The offending partition segment (e.g. `event_year` or `event_year:year`). */
  segment: string
  /** The companion column name the segment references. */
  companionName: string
  /** The primary auto-fill field name to use instead (for the hint). */
  primaryName: string
}

/**
 * A partition segment that does not point at exactly one top-level field.
 *
 * Partition segments are stored by field id. A segment imported from a
 * `endpoint.json` whose name matches no top-level field, or more than one,
 * stays "unresolved" (it keeps its raw name so the file round-trips unchanged).
 * The schema only checks the segment's grammar, not that the field exists, so
 * without this finding a well-formed segment such as `ghost:year` would pass
 * the gate and produce a definition the runtime cannot partition by.
 */
export interface UnresolvedPartitionDiagnostic {
  /** The segment's raw field name, exactly as imported. */
  name: string
  /** The segment's raw component text, present only for `name:component`. */
  component?: string
  /**
   * Why the name resolves to no single field: `missing` when no top-level field
   * has the name, `ambiguous` when more than one does.
   */
  reason: "missing" | "ambiguous"
}

/**
 * The result of the "valid for export" gate.
 *
 * `validForExport` is the single boolean the export path consumes. It is the
 * conjunction of a schema parse, the absence of duplicate field names, every
 * `regex` pattern being constructible, every `min`/`max` bound being a finite
 * number, the four auto-fill rules (reserved-name collision, valid placement, a
 * compatible enabled mutation, and no companion-column partition segment), and
 * every partition segment pointing at exactly one top-level field. Each failure
 * kind is reported separately and, where possible, keyed to the editor field
 * `id` so the UI can render inline diagnostics.
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
  /** Reserved-name collisions against auto-fill names/companions (C3/C14). */
  reservedNames: ReservedNameDiagnostic[]
  /** Invalid `autoFill` placements (non-DateTime or nested, C12/C13/C17). */
  autoFillPlacement: AutoFillPlacementDiagnostic[]
  /** Auto-fill fields lacking a compatible enabled mutation (C11/C16). */
  autoFillMutation: AutoFillMutationDiagnostic[]
  /** Partition segments referencing a derived companion column (C15/FR6.3). */
  companionPartition: CompanionPartitionDiagnostic[]
  /** Partition segments naming no single top-level field (missing/ambiguous). */
  unresolvedPartition: UnresolvedPartitionDiagnostic[]
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
 * Resolves a top-level editor field by name, returning its `id` when exactly
 * one top-level field carries that name. Returns `undefined` when none or more
 * than one match, so a collision diagnostic never points at an ambiguous field.
 */
function topLevelFieldIdByName(
  state: EditorState,
  name: string
): string | undefined {
  const matches = state.fields.filter((field) => field.name === name)
  return matches.length === 1 ? matches[0]?.id : undefined
}

/**
 * Collects reserved-name collisions among top-level fields, mirroring
 * `findReservedNameCollisions` (C3/C14), and keys each to the colliding editor
 * field's `id` when it resolves.
 */
function collectReservedNameCollisions(
  state: EditorState,
  defFields: FieldDefinition[]
): ReservedNameDiagnostic[] {
  return findReservedNameCollisions(defFields).map((collision) => {
    const fieldId = topLevelFieldIdByName(state, collision.name)
    return {
      name: collision.name,
      ...(fieldId === undefined ? {} : { fieldId }),
    }
  })
}

/**
 * Collects invalid `autoFill` placements (C12/C13/C17): a non-`DateTime`
 * auto-fill field at the top level, and an auto-fill field nested at any depth
 * inside an `Object` or `Array`-of-`Object`. Keys each to the offending editor
 * field's `id` by walking the editor tree in lockstep with the definition.
 */
function collectAutoFillPlacement(
  editorFields: EditorField[],
  defFields: FieldDefinition[]
): AutoFillPlacementDiagnostic[] {
  const findings: AutoFillPlacementDiagnostic[] = []

  // Top level: a non-DateTime auto-fill field is an invalid placement. A
  // top-level DateTime auto-fill field is valid here (other rules check it).
  for (const [i, def] of defFields.entries()) {
    if (def.options?.autoFill === undefined || def.type === "DateTime") {
      continue
    }
    const editor = editorFields[i]
    findings.push({
      name: def.name,
      reason: "non-datetime",
      ...(editor === undefined ? {} : { fieldId: editor.id }),
    })
  }

  // Nested (depth > 0): any auto-fill field inside an Object or
  // Array-of-Object is invalid regardless of type.
  const walkNested = (
    editors: EditorField[],
    defs: FieldDefinition[]
  ): void => {
    for (const [i, def] of defs.entries()) {
      const editor = editors[i]
      if (def.options?.autoFill !== undefined) {
        findings.push({
          name: def.name,
          reason: "nested",
          ...(editor === undefined ? {} : { fieldId: editor.id }),
        })
      }
      if (def.type === "Object" && def.fields !== undefined) {
        walkNested(editor?.fields ?? [], def.fields)
      } else if (
        def.type === "Array" &&
        def.items?.type === "Object" &&
        def.items.fields !== undefined
      ) {
        walkNested(editor?.items?.fields ?? [], def.items.fields)
      }
    }
  }

  for (const [i, def] of defFields.entries()) {
    const editor = editorFields[i]
    if (def.type === "Object" && def.fields !== undefined) {
      walkNested(editor?.fields ?? [], def.fields)
    } else if (
      def.type === "Array" &&
      def.items?.type === "Object" &&
      def.items.fields !== undefined
    ) {
      walkNested(editor?.items?.fields ?? [], def.items.fields)
    }
  }

  return findings
}

/**
 * Collects auto-fill fields lacking a compatible enabled mutation (C11/C16).
 * `autoFill` is valid only with an enabled `append`/`full_load_append`
 * mutation; `full_load` and a disabled/absent mutation both invalidate it.
 */
function collectAutoFillMutation(
  state: EditorState,
  defFields: FieldDefinition[]
): AutoFillMutationDiagnostic[] {
  const autoFillTop = defFields
    .map((def, index) => ({ def, index }))
    .filter(({ def }) => def.options?.autoFill !== undefined)
  if (autoFillTop.length === 0) {
    return []
  }

  const { mutation } = state
  const mutationEnabled = mutation.enabled
  const strategy = mutationEnabled ? mutation.loadStrategy : undefined
  const allowed = strategy === "append" || strategy === "full_load_append"
  if (allowed) {
    return []
  }

  return autoFillTop.map(({ def, index }) => {
    const editor = state.fields[index]
    return {
      name: def.name,
      mutationEnabled,
      ...(editor === undefined ? {} : { fieldId: editor.id }),
    }
  })
}

/**
 * Collects partition-string segments referencing a derived companion column
 * (C15/FR6.3). Only runs when a top-level auto-fill field exists and the
 * mutation carries a string partition value; every segment whose field name is
 * a companion name is rejected, in any form (bare or with a `:component`).
 */
function collectCompanionPartition(
  state: EditorState,
  defFields: FieldDefinition[]
): CompanionPartitionDiagnostic[] {
  const { mutation } = state
  if (!mutation.enabled || mutation.partitioning === false) {
    return []
  }
  const partitionString = serializePartitionSegments(
    mutation.partitioning,
    state.fields
  )

  // Map each companion name to its primary auto-fill field name for the hint.
  const companionToPrimary = new Map<string, string>()
  for (const def of defFields) {
    if (def.options?.autoFill === undefined) {
      continue
    }
    for (const companion of autoFillCompanionNames(def)) {
      if (!companionToPrimary.has(companion)) {
        companionToPrimary.set(companion, def.name)
      }
    }
  }
  if (companionToPrimary.size === 0) {
    return []
  }

  const findings: CompanionPartitionDiagnostic[] = []
  for (const segment of partitionString.split("/")) {
    const [segmentField = ""] = segment.split(":")
    const primaryName = companionToPrimary.get(segmentField)
    if (primaryName !== undefined) {
      findings.push({ segment, companionName: segmentField, primaryName })
    }
  }
  return findings
}

/**
 * Collects partition segments that do not point at exactly one top-level field.
 *
 * Only unresolved segments are considered: a resolved segment carries a field
 * id and therefore always names a field. For each unresolved segment the
 * current top-level fields decide the outcome — no match is `missing`, several
 * are `ambiguous`, and exactly one match is fine (the exported name resolves
 * on its own, even though the stored segment never got its id).
 *
 * Two kinds of unresolved segment are deliberately left to other findings so
 * one mistake is never reported twice: a segment whose syntax the schema
 * already rejects (`validatePartitioningFormat`), and a segment naming a
 * derived companion column, which {@link collectCompanionPartition} reports
 * with a more precise hint.
 *
 * @param state - The live editor state.
 * @param defFields - The candidate definition's top-level fields, used to
 *   derive the companion column names.
 * @returns One finding per offending segment, in segment order.
 */
function collectUnresolvedPartition(
  state: EditorState,
  defFields: FieldDefinition[]
): UnresolvedPartitionDiagnostic[] {
  const { mutation } = state
  if (!mutation.enabled || mutation.partitioning === false) {
    return []
  }

  const companionNames = new Set<string>()
  for (const def of defFields) {
    if (def.options?.autoFill === undefined) {
      continue
    }
    for (const companion of autoFillCompanionNames(def)) {
      companionNames.add(companion)
    }
  }

  const findings: UnresolvedPartitionDiagnostic[] = []
  for (const segment of mutation.partitioning) {
    if (isResolvedPartitionSegment(segment)) {
      continue
    }
    const { unresolvedName: name, component } = segment
    const raw = component === undefined ? name : `${name}:${component}`
    if (companionNames.has(name) || validatePartitioningFormat(raw) !== null) {
      continue
    }
    const matches = state.fields.filter((field) => field.name === name).length
    if (matches === 1) {
      continue
    }
    findings.push({
      name,
      ...(component === undefined ? {} : { component }),
      reason: matches === 0 ? "missing" : "ambiguous",
    })
  }
  return findings
}

/**
 * The message for an enabled by-field partitioning with no segments chosen.
 */
export const EMPTY_PARTITIONING_MESSAGE =
  'Choose at least one partition field, or set partitioning to "Off".'

/** Whether a schema issue addresses the mutation's `partitioning` value. */
function isPartitioningPath(path: (string | number)[]): boolean {
  return (
    path.length === 2 && path[0] === "mutation" && path[1] === "partitioning"
  )
}

/**
 * Collapses the schema issues an empty by-field selection produces into one.
 *
 * With "By field / custom format" active and no segments chosen, the exported
 * partitioning is the empty string, which the schema rejects twice at the same
 * path (minimum length, and the partition-format check) with raw validator
 * wording. Both describe one problem, so they are replaced, at the position of
 * the first, by a single issue with {@link EMPTY_PARTITIONING_MESSAGE}. The gate
 * still blocks export; only the count and the wording change.
 *
 * Only the no-segments case is collapsed: a non-empty selection whose string is
 * still invalid (for example a segment naming an unnamed field) keeps the
 * schema's own messages.
 *
 * @param state - The live editor state.
 * @param issues - The raw schema issues.
 * @returns The issues with an empty selection reported once.
 */
function collapseEmptyPartitionSelection(
  state: EditorState,
  issues: SchemaDiagnostic[]
): SchemaDiagnostic[] {
  const { mutation } = state
  const emptySelection =
    mutation.enabled &&
    mutation.partitioning !== false &&
    mutation.partitioning.length === 0
  if (!emptySelection) {
    return issues
  }
  const collapsed: SchemaDiagnostic[] = []
  let replaced = false
  for (const issue of issues) {
    if (!isPartitioningPath(issue.path)) {
      collapsed.push(issue)
      continue
    }
    if (!replaced) {
      collapsed.push({ path: issue.path, message: EMPTY_PARTITIONING_MESSAGE })
      replaced = true
    }
  }
  return collapsed
}

/**
 * Evaluates the "valid for export" gate for the current editor state.
 *
 * Builds the candidate definition via {@link toDefinition}, then composes the
 * checks in order: a parse against `endpointDefinitionSchema`, the
 * duplicate-field-name check (`findDuplicateFieldNames`, which the schema does
 * not itself enforce), regex constructibility (each `regex` pattern must
 * survive `new RegExp(pattern)`, matching how the CLI emits it), numeric
 * finiteness (each `min`/`max` bound must be a finite number, since `NaN`
 * serializes to `null` and the CLI would then reject it), and the four
 * auto-fill rules — reserved-name collisions (`findReservedNameCollisions`,
 * C3/C14), valid placement (top-level `DateTime` only, C12/C13/C17), a
 * compatible enabled mutation (`append`/`full_load_append`, C11/C16), and no
 * partition segment referencing a derived companion column (C15/FR6.3). The
 * last three mirror the endpoint schema so the field-keyed Studio findings sit
 * alongside the raw schema issues (FR4.6). The definition is valid for export
 * only when every check passes.
 *
 * @param state - The live editor state to evaluate.
 * @returns A {@link ValidationResult} with the gate result and field-keyed
 *   diagnostics.
 */
export function evaluate(state: EditorState): ValidationResult {
  const candidate = toDefinition(state)

  const parsed = endpointDefinitionSchema.safeParse(candidate)
  const rawSchemaIssues: SchemaDiagnostic[] = parsed.success
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
  const schemaIssues = collapseEmptyPartitionSelection(state, rawSchemaIssues)

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

  const reservedNames = collectReservedNameCollisions(state, candidate.fields)

  const autoFillPlacement = collectAutoFillPlacement(
    state.fields,
    candidate.fields
  )

  const autoFillMutation = collectAutoFillMutation(state, candidate.fields)

  const companionPartition = collectCompanionPartition(state, candidate.fields)

  const unresolvedPartition = collectUnresolvedPartition(
    state,
    candidate.fields
  )

  const validForExport =
    parsed.success &&
    duplicates.length === 0 &&
    badRegex.length === 0 &&
    badNumber.length === 0 &&
    reservedNames.length === 0 &&
    autoFillPlacement.length === 0 &&
    autoFillMutation.length === 0 &&
    companionPartition.length === 0 &&
    unresolvedPartition.length === 0

  return {
    validForExport,
    schemaIssues,
    duplicates,
    badRegex,
    badNumber,
    reservedNames,
    autoFillPlacement,
    autoFillMutation,
    companionPartition,
    unresolvedPartition,
  }
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
