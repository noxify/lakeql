import {
  DEFAULT_WRITE_METHOD,
  datePartitioningComponents,
  partitioningComponents,
} from "@lakeql/schema-generator/endpoint-schema"

import type {
  EditorField,
  EditorFieldType,
  EditorPartitionSegment,
  EditorResolvedPartitionSegment,
  EditorState,
} from "./model"

/**
 * A partition segment as written in the name-based partition string: a raw
 * field name plus an optional raw component.
 */
interface RawPartitionSegment {
  name: string
  component?: string
}

/**
 * Parses a name-based partition string into raw `{ name, component }` pairs.
 *
 * Splits on `/`, then each segment on its first `:`. The parse never throws and
 * tolerates partial input; invalidity is surfaced by schema validation, not
 * here. An empty string yields no segments.
 */
function parseRawSegments(value: string): RawPartitionSegment[] {
  if (value === "") {
    return []
  }
  return value.split("/").map((raw) => {
    const colon = raw.indexOf(":")
    if (colon === -1) {
      return { name: raw }
    }
    return { name: raw.slice(0, colon), component: raw.slice(colon + 1) }
  })
}

/**
 * Narrows a partition segment to one bound to a field by id.
 *
 * @param segment - The segment to test.
 * @returns `true` when the segment carries a `fieldId`.
 */
export function isResolvedPartitionSegment(
  segment: EditorPartitionSegment
): segment is EditorResolvedPartitionSegment {
  return "fieldId" in segment
}

/**
 * Returns the ids of a field and every field nested beneath it (`Object`
 * children and `Array`-of-`Object` item children).
 *
 * @param field - The subtree root.
 * @returns The subtree's ids, root first.
 */
export function collectFieldIds(field: EditorField): string[] {
  const ids = [field.id]
  const children =
    field.type === "Object"
      ? field.fields
      : field.type === "Array" && field.items?.type === "Object"
        ? field.items.fields
        : undefined
  for (const child of children ?? []) {
    ids.push(...collectFieldIds(child))
  }
  return ids
}

/** Finds a field by id anywhere in the tree. */
function findFieldById(
  fields: EditorField[],
  fieldId: string
): EditorField | undefined {
  for (const field of fields) {
    if (field.id === fieldId) {
      return field
    }
    const children =
      field.type === "Object"
        ? field.fields
        : field.type === "Array" && field.items?.type === "Object"
          ? field.items.fields
          : undefined
    if (children !== undefined) {
      const nested = findFieldById(children, fieldId)
      if (nested !== undefined) {
        return nested
      }
    }
  }
  return undefined
}

/**
 * Resolves a name-based partition string into id-based segments.
 *
 * A segment's name binds to a top-level field only when exactly one top-level
 * field carries that (non-empty) name. A name with no match, or one shared by
 * several top-level fields, is kept as an unresolved segment with its raw name
 * and component, so nothing is lost and export writes it back unchanged.
 *
 * @param value - The name-based partition string (`a/b:day`).
 * @param fields - The editor's top-level fields.
 * @returns The ordered segments (empty for an empty string).
 */
export function resolvePartitionString(
  value: string,
  fields: EditorField[]
): EditorPartitionSegment[] {
  return parseRawSegments(value).map(({ name, component }) => {
    const matches =
      name === "" ? [] : fields.filter((field) => field.name === name)
    const match = matches.length === 1 ? matches[0] : undefined
    if (match === undefined) {
      return component === undefined
        ? { unresolvedName: name }
        : { unresolvedName: name, component }
    }
    return component === undefined
      ? { fieldId: match.id }
      : { fieldId: match.id, component }
  })
}

/**
 * The raw field name a segment currently serializes to: the live name of the
 * referenced field (empty when the id no longer exists), or the imported name.
 */
function segmentName(
  segment: EditorPartitionSegment,
  fields: EditorField[]
): string {
  return isResolvedPartitionSegment(segment)
    ? (findFieldById(fields, segment.fieldId)?.name ?? "")
    : segment.unresolvedName
}

/**
 * Serializes id-based segments to the name-based, `/`-separated partition
 * string used by the export. Each segment becomes `name` or `name:component`
 * using the referenced field's current name.
 *
 * @param segments - The ordered segments.
 * @param fields - The editor's fields, used to look up each segment's name.
 * @returns The partition string (empty for no segments).
 */
export function serializePartitionSegments(
  segments: EditorPartitionSegment[],
  fields: EditorField[]
): string {
  return segments
    .map((segment) => {
      const name = segmentName(segment, fields)
      return segment.component === undefined
        ? name
        : `${name}:${segment.component}`
    })
    .join("/")
}

/**
 * The human-readable label of a segment, e.g. `created_at` or
 * `created_at → year`, using the referenced field's current name.
 *
 * @param segment - The segment to describe.
 * @param fields - The editor's fields, used to look up the segment's name.
 * @returns The display label.
 */
export function partitionSegmentLabel(
  segment: EditorPartitionSegment,
  fields: EditorField[]
): string {
  const name = segmentName(segment, fields)
  return segment.component === undefined
    ? name
    : `${name} → ${segment.component}`
}

/**
 * Whether a field of `type` is a valid source for a partition segment with the
 * given `component`: never `Object`/`Array`; `Date`/`DateTime` only with a
 * component (a bare date has no raw-value meaning), and `Date` never with a
 * time component (`hour`/`minute`/`second`, a date has no time of day); every
 * other type only without one.
 *
 * @param type - The referenced field's type.
 * @param component - The segment's component, if any.
 * @returns `true` when the segment would be valid for that type.
 */
export function isValidPartitionSource(
  type: EditorFieldType,
  component: string | undefined
): boolean {
  if (type === "Object" || type === "Array") {
    return false
  }
  if (type === "Date" && component !== undefined) {
    return !timeComponents.has(component)
  }
  const isDate = type === "Date" || type === "DateTime"
  return isDate ? component !== undefined : component === undefined
}

/** The components that need a time of day, so are invalid on a `Date`. */
const timeComponents: ReadonlySet<string> = new Set(
  partitioningComponents.filter(
    (component) =>
      !(datePartitioningComponents as readonly string[]).includes(component)
  )
)

/**
 * Lists the segments of the by-field partitioning that reference any of the
 * given field ids. Empty when partitioning is off.
 *
 * @param state - The editor state.
 * @param fieldIds - The referenced field ids to look for.
 * @returns The matching segments, in path order.
 */
export function partitionSegmentsReferencing(
  state: EditorState,
  fieldIds: ReadonlySet<string>
): EditorResolvedPartitionSegment[] {
  const { mutation } = state
  if (!mutation.enabled || mutation.partitioning === false) {
    return []
  }
  return mutation.partitioning.filter(
    (segment): segment is EditorResolvedPartitionSegment =>
      isResolvedPartitionSegment(segment) && fieldIds.has(segment.fieldId)
  )
}

/**
 * Removes every segment referencing any of the given field ids, leaving the
 * other segments (and their order) intact. An emptied by-field selection stays
 * an empty list (still in by-field mode); partitioning that is off, or a state
 * with no matching segment, is returned as is.
 *
 * @param state - The editor state.
 * @param fieldIds - The field ids whose segments are removed.
 * @returns A new state, or the same state when nothing matched.
 */
export function removePartitionSegments(
  state: EditorState,
  fieldIds: ReadonlySet<string>
): EditorState {
  const { mutation } = state
  if (!mutation.enabled || mutation.partitioning === false) {
    return state
  }
  const kept = mutation.partitioning.filter(
    (segment) =>
      !(isResolvedPartitionSegment(segment) && fieldIds.has(segment.fieldId))
  )
  if (kept.length === mutation.partitioning.length) {
    return state
  }
  return { ...state, mutation: { ...mutation, partitioning: kept } }
}

/**
 * Converts a state that may still carry the legacy name-based partition string
 * (an older autosaved draft) to the id-based shape.
 *
 * A string value is resolved against the state's top-level fields via
 * {@link resolvePartitionString}. An enabled mutation without a `writeMethod`
 * (an older draft) gets `"storage"` on every path. Any other state is returned
 * unchanged.
 *
 * @param state - A state read from storage, possibly in the legacy shape.
 * @returns The state with id-based partitioning.
 */
export function migrateEditorState(state: EditorState): EditorState {
  const { mutation: stored } = state
  if (!stored.enabled) {
    return state
  }
  // An older draft has no write method. Default it before every branch below,
  // so no return path skips it; every branch builds on `mutation`.
  const missingWriteMethod =
    (stored as { writeMethod?: unknown }).writeMethod === undefined
  const mutation = missingWriteMethod
    ? { ...stored, writeMethod: DEFAULT_WRITE_METHOD }
    : stored
  const legacy = mutation.partitioning as unknown
  if (typeof legacy === "string") {
    return {
      ...state,
      mutation: {
        ...mutation,
        partitioning: resolvePartitionString(legacy, state.fields),
      },
    }
  }
  if (legacy !== false && !Array.isArray(legacy)) {
    return { ...state, mutation: { ...mutation, partitioning: false } }
  }
  return missingWriteMethod ? { ...state, mutation } : state
}
