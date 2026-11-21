import { partitioningComponents } from "@lakeql/schema-generator/endpoint-schema"

import type {
  EditorField,
  EditorFieldType,
  EditorPartitionSegment,
  EditorResolvedPartitionSegment,
} from "@/core"
import { isResolvedPartitionSegment } from "@/core"

import type { PartitioningMode } from "./validation-meta"

/**
 * A candidate top-level field eligible for the partition picker.
 */
export interface PartitionCandidate {
  /** The field's stable client-side id, which segments reference. */
  id: string
  /** The field's name. */
  name: string
  /** The field's editor type. */
  type: EditorFieldType
  /** `true` for `Date`/`DateTime`, which expand into component options. */
  isDateLike: boolean
}

/**
 * One selectable combobox option backing exactly one partition segment.
 */
export interface PartitionOption {
  /** Stable option key: `"<fieldId>"` or `"<fieldId>:<component>"`. */
  value: string
  /** Display label, e.g. `"created_at → year"`. */
  label: string
  /** The resolved segment this option appends when chosen. */
  segment: EditorResolvedPartitionSegment
}

/**
 * Lists the top-level primitive partition candidates.
 *
 * A field is a candidate iff it is a primitive (not `Object`/`Array`) and has a
 * non-empty name, so in-progress empty-named fields never appear. Input order
 * is preserved. `Date`/`DateTime` fields are flagged via {@link
 * PartitionCandidate.isDateLike} so the caller can expand them into component
 * options.
 *
 * @param fields - The top-level editor fields.
 * @returns One candidate per eligible top-level field, in input order.
 */
export function topLevelPartitionCandidates(
  fields: EditorField[]
): PartitionCandidate[] {
  const candidates: PartitionCandidate[] = []
  for (const field of fields) {
    if (field.type === "Object" || field.type === "Array") {
      continue
    }
    if (field.name === "") {
      continue
    }
    candidates.push({
      id: field.id,
      name: field.name,
      type: field.type,
      isDateLike: field.type === "Date" || field.type === "DateTime",
    })
  }
  return candidates
}

/**
 * Expands candidates into the selectable combobox options.
 *
 * A non-date primitive yields one option (segment `{ fieldId }`, value the
 * field id). A date-like candidate yields six options — one per
 * `partitioningComponents` entry (`year`/`month`/`day`/`hour`/`minute`/`second`,
 * value `fieldId:component`, label `fieldname → component`). Options are keyed
 * by id, so two same-named fields stay distinct choices.
 *
 * All six components are offered (decision A1): `validatePartitioningString`
 * accepts every `partitioningComponents` entry in a `fieldname:component`
 * segment.
 *
 * @param candidates - The candidates from {@link topLevelPartitionCandidates}.
 * @returns The flattened option list, in candidate then component order.
 */
export function partitionOptionsFor(
  candidates: PartitionCandidate[]
): PartitionOption[] {
  const options: PartitionOption[] = []
  for (const candidate of candidates) {
    if (!candidate.isDateLike) {
      options.push({
        value: candidate.id,
        label: candidate.name,
        segment: { fieldId: candidate.id },
      })
      continue
    }
    for (const component of partitioningComponents) {
      options.push({
        value: `${candidate.id}:${component}`,
        label: `${candidate.name} → ${component}`,
        segment: { fieldId: candidate.id, component },
      })
    }
  }
  return options
}

/**
 * A stable key for a segment, used for the "already chosen" filter and as the
 * base of its sortable id. A resolved segment keys on its field id, an
 * unresolved one on its raw name (prefixed so it cannot collide with an id).
 *
 * @param segment - The segment to key.
 * @returns `"<fieldId>"`/`"<fieldId>:<component>"`, or `"?<name>"`-prefixed for
 *   an unresolved segment.
 */
export function partitionSegmentKey(segment: EditorPartitionSegment): string {
  const base = isResolvedPartitionSegment(segment)
    ? segment.fieldId
    : `?${segment.unresolvedName}`
  return segment.component === undefined ? base : `${base}:${segment.component}`
}

/**
 * Maps a rich radio mode to the editor `partitioning` value.
 *
 * `off` → `false`, `field` → the current segments, or `[]` to seed an empty
 * picker when coming from `off`. Switching to `off` discards the chosen
 * segments by design (the state holds a single value); each mode switch is its
 * own history snapshot, so undo restores them. This is the pure, unit-testable
 * replacement for the form's former inline `setMode` mapping;
 * {@link partitioningModeOf} is the reverse.
 *
 * @param mode - The selected rich radio mode.
 * @param current - The current `partitioning` value.
 * @returns The `partitioning` value the editor should store for that mode.
 */
export function partitioningValueForMode(
  mode: PartitioningMode,
  current: false | EditorPartitionSegment[]
): false | EditorPartitionSegment[] {
  if (mode === "off") {
    return false
  }
  return current === false ? [] : current
}
