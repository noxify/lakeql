import type { PartitioningComponent } from "@lakeql/schema-generator/endpoint-schema"
import { partitioningComponents } from "@lakeql/schema-generator/endpoint-schema"

import type { EditorField, EditorFieldType } from "@/core"
import { LOAD_TIMESTAMP_FIELD_NAME } from "@/core"

import type { PartitioningMode } from "./validation-meta"

/**
 * One resolved partition segment of the `/`-separated partitioning string.
 *
 * A segment is either a bare `fieldname` ({@link component} absent) or a
 * `fieldname:component` pair ({@link component} present), matching the frozen
 * grammar accepted by `validatePartitioningFormat`.
 */
export interface PartitionSegment {
  /** Top-level field name. */
  field: string
  /** Date component, present only for a `fieldname:component` segment. */
  component?: PartitioningComponent
}

/**
 * A candidate top-level field eligible for the partition picker.
 */
export interface PartitionCandidate {
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
  /** Serialized segment value, e.g. `"created_at"` or `"created_at:year"`. */
  value: string
  /** Display label, e.g. `"created_at → year"`. */
  label: string
  /** The resolved segment this option appends when chosen. */
  segment: PartitionSegment
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
 * A non-date primitive yields one option (segment `{ field }`, value
 * `fieldname`). A date-like candidate yields six options — one per
 * `partitioningComponents` entry (`year`/`month`/`day`/`hour`/`minute`/`second`,
 * value `fieldname:component`, label `fieldname → component`).
 *
 * All six components are offered (decision A1): `validatePartitioningFormat`
 * accepts every `partitioningComponents` entry in a `fieldname:component`
 * segment, so the picker is not narrowed to the three `partitioningFormats`
 * granularities.
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
        value: candidate.name,
        label: candidate.name,
        segment: { field: candidate.name },
      })
      continue
    }
    for (const component of partitioningComponents) {
      options.push({
        value: `${candidate.name}:${component}`,
        label: `${candidate.name} → ${component}`,
        segment: { field: candidate.name, component },
      })
    }
  }
  return options
}

/**
 * Serializes chosen segments to the `/`-separated partitioning string.
 *
 * Each segment becomes `field` or `field:component`; segments are joined with
 * `/` in order, so the string order equals the segment order.
 *
 * @param segments - The ordered chosen segments.
 * @returns The `/`-separated partitioning string (empty for no segments).
 */
export function serializePartitionSegments(
  segments: PartitionSegment[]
): string {
  return segments
    .map((segment) =>
      segment.component === undefined
        ? segment.field
        : `${segment.field}:${segment.component}`
    )
    .join("/")
}

/**
 * Parses a partitioning string back into its ordered segment list.
 *
 * Splits on `/`, then each segment on its first `:`. A segment without `:` is
 * `{ field }`; with `:` it is `{ field, component }`. The parse never throws
 * and tolerates partial input (for example `":day"` parses to
 * `{ field: "", component: "day" }`), because the picker seeds from whatever
 * string is currently stored — invalidity is surfaced by
 * `validatePartitioningFormat`, not here. For any well-formed `s`,
 * `serializePartitionSegments(parsePartitionSegments(s)) === s`.
 *
 * @param value - The stored partitioning string.
 * @returns The ordered segment list (empty for an empty string).
 */
export function parsePartitionSegments(value: string): PartitionSegment[] {
  if (value === "") {
    return []
  }
  return value.split("/").map((raw) => {
    const colon = raw.indexOf(":")
    if (colon === -1) {
      return { field: raw }
    }
    return {
      field: raw.slice(0, colon),
      component: raw.slice(colon + 1) as PartitioningComponent,
    }
  })
}

/**
 * Whether a real top-level field already owns the `load_timestamp` name.
 *
 * Only top-level fields are inspected (the derived field is top-level); when
 * `true` the UI blocks the timestamp partitioning mode so export never emits a
 * duplicate `load_timestamp`.
 *
 * @param fields - The top-level editor fields.
 * @returns `true` when a top-level field is named `load_timestamp`.
 */
export function hasLoadTimestampCollision(fields: EditorField[]): boolean {
  return fields.some((field) => field.name === LOAD_TIMESTAMP_FIELD_NAME)
}

/**
 * Maps a rich radio mode to the editor `partitioning` value.
 *
 * `timestamp` → `true`, `off` → `false`, `field` → the current string (so a
 * custom format is preserved when re-entering field mode) or `""` to seed an
 * empty picker. This is the pure, unit-testable replacement for the form's
 * former inline `setMode` mapping; {@link partitioningModeOf} is the reverse.
 *
 * @param mode - The selected rich radio mode.
 * @param current - The current `partitioning` value.
 * @returns The `partitioning` value the editor should store for that mode.
 */
export function partitioningValueForMode(
  mode: PartitioningMode,
  current: boolean | string
): boolean | string {
  if (mode === "timestamp") {
    return true
  }
  if (mode === "off") {
    return false
  }
  return typeof current === "string" ? current : ""
}
