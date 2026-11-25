import {
  datePartitioningComponents,
  partitioningComponents,
} from "@lakeql/schema-generator/endpoint-schema"

import type {
  EditorField,
  EditorFieldType,
  EditorPartitionSegment,
  EditorResolvedPartitionSegment,
} from "@/core"
import { isResolvedPartitionSegment } from "@/core"

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
 * One selectable picker option. Choosing it appends its segments in order.
 */
export interface PartitionOption {
  /** Stable option key: `"<fieldId>"`, `"<fieldId>:<component>"` or `"<fieldId>:date"`. */
  value: string
  /** Full display label, e.g. `"created_at → year"`. */
  label: string
  /** Label inside a field's sub-page, e.g. `"year"` or `"year / month / day"`. */
  shortLabel: string
  /** Extra search text so `"created year"` finds `created → year`. */
  keywords: string[]
  /** The resolved segments this option appends when chosen (three for the combined option). */
  segments: EditorResolvedPartitionSegment[]
}

/**
 * The date components the combined `year / month / day` option expands to.
 */
export const combinedDateComponents = ["year", "month", "day"] as const

/**
 * Lists the top-level primitive partition candidates.
 *
 * A field is a candidate iff it is a primitive (not `Object`/`Array`) and has a
 * non-empty name, so in-progress empty-named fields never appear. Input order
 * is preserved. `Date`/`DateTime` fields are flagged via {@link
 * PartitionCandidate.isDateLike} so the caller can drill into component
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
 * The option choosing one non-date field (a bare, raw-value segment).
 *
 * @param candidate - A non-date candidate.
 * @returns The single-segment option.
 */
function bareOption(candidate: PartitionCandidate): PartitionOption {
  return {
    value: candidate.id,
    label: candidate.name,
    shortLabel: candidate.name,
    keywords: [candidate.name],
    segments: [{ fieldId: candidate.id }],
  }
}

/**
 * The sub-page options of a date-like candidate: first the combined
 * `year / month / day` option (appends all three segments), then one option
 * per component: every `partitioningComponents` entry for a `DateTime`, only
 * `datePartitioningComponents` (no time of day) for a `Date`. Options whose segment is already chosen
 * are omitted; the combined option is omitted as soon as any of its three
 * segments is chosen, so it can never create a duplicate.
 *
 * @param candidate - A date-like candidate.
 * @param chosen - Keys of the segments already chosen ({@link partitionSegmentKey}).
 * @returns The available sub-page options, in display order.
 */
export function partitionDateOptions(
  candidate: PartitionCandidate,
  chosen: ReadonlySet<string>
): PartitionOption[] {
  const options: PartitionOption[] = []
  const combinedKeys = combinedDateComponents.map(
    (component) => `${candidate.id}:${component}`
  )
  if (!combinedKeys.some((key) => chosen.has(key))) {
    options.push({
      value: `${candidate.id}:date`,
      label: `${candidate.name} → year / month / day`,
      shortLabel: "year / month / day",
      keywords: [`${candidate.name} year month day`],
      segments: combinedDateComponents.map((component) => ({
        fieldId: candidate.id,
        component,
      })),
    })
  }
  const components =
    candidate.type === "Date"
      ? datePartitioningComponents
      : partitioningComponents
  for (const component of components) {
    const value = `${candidate.id}:${component}`
    if (chosen.has(value)) {
      continue
    }
    options.push({
      value,
      label: `${candidate.name} → ${component}`,
      shortLabel: component,
      keywords: [`${candidate.name} ${component}`],
      segments: [{ fieldId: candidate.id, component }],
    })
  }
  return options
}

/**
 * The root-page options: one bare option per non-date candidate whose segment
 * is not chosen yet. Date-like candidates are not listed here; they open a
 * sub-page ({@link partitionDateOptions}).
 *
 * @param candidates - The candidates from {@link topLevelPartitionCandidates}.
 * @param chosen - Keys of the segments already chosen.
 * @returns The available root options, in candidate order.
 */
export function partitionRootOptions(
  candidates: PartitionCandidate[],
  chosen: ReadonlySet<string>
): PartitionOption[] {
  return candidates
    .filter((candidate) => !candidate.isDateLike)
    .map(bareOption)
    .filter((option) => !chosen.has(option.value))
}

/**
 * The flat, searchable option list: every available root option plus every
 * available sub-page option of each date-like candidate, so a query such as
 * `"event year"` matches `event → year` from the root page.
 *
 * @param candidates - The candidates from {@link topLevelPartitionCandidates}.
 * @param chosen - Keys of the segments already chosen.
 * @returns The available options, in candidate order.
 */
export function partitionSearchOptions(
  candidates: PartitionCandidate[],
  chosen: ReadonlySet<string>
): PartitionOption[] {
  const options: PartitionOption[] = []
  for (const candidate of candidates) {
    if (candidate.isDateLike) {
      options.push(...partitionDateOptions(candidate, chosen))
    } else if (!chosen.has(candidate.id)) {
      options.push(bareOption(candidate))
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
