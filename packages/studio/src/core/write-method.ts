import type { WriteMethod } from "@lakeql/schema-generator/endpoint-schema"
import { effectiveWriteMethod } from "@lakeql/schema-generator/endpoint-schema"

import type { EditorField, EditorState } from "./model"
import { partitionSegmentLabel } from "./partitioning"

/**
 * What switching the write method would discard.
 */
export interface WriteMethodChangePlan {
  /** Whether the switch discards anything and therefore needs confirmation. */
  needsConfirmation: boolean
  /** The base path that would be cleared, or `undefined` when none is set. */
  discardedBasePath: string | undefined
  /** Whether a non-empty base path would be discarded. */
  discardsBasePath: boolean
  /** Whether partitioning other than off would be turned off. */
  discardsPartitioning: boolean
  /** Label of the partitioning that would be turned off, when discarded. */
  discardedPartitioningLabel: string | undefined
  /** Names of the fields whose autoFill option would be removed. */
  autoFillFields: string[]
}

/** Plan for a switch that discards nothing. */
const NO_DISCARD: WriteMethodChangePlan = {
  needsConfirmation: false,
  discardedBasePath: undefined,
  discardsBasePath: false,
  discardsPartitioning: false,
  discardedPartitioningLabel: undefined,
  autoFillFields: [],
}

/**
 * Describes what switching to `next` would discard. Only storage → insert can
 * discard anything. A disabled mutation, or the same method, is a no-op plan.
 *
 * @param state - The current editor state.
 * @param next - The write method to switch to.
 * @returns The plan; `needsConfirmation` is `true` when anything is discarded.
 */
export function planWriteMethodChange(
  state: EditorState,
  next: WriteMethod
): WriteMethodChangePlan {
  const { mutation } = state
  if (
    !mutation.enabled ||
    next !== "insert" ||
    effectiveWriteMethod(mutation) === next
  ) {
    return NO_DISCARD
  }

  const discardsBasePath = mutation.basePath !== ""
  const discardsPartitioning = mutation.partitioning !== false
  const autoFillFields = state.fields
    .filter((field) => field.options?.autoFill !== undefined)
    .map((field) => field.name)

  return {
    needsConfirmation:
      discardsBasePath || discardsPartitioning || autoFillFields.length > 0,
    discardedBasePath: discardsBasePath ? mutation.basePath : undefined,
    discardsBasePath,
    discardsPartitioning,
    discardedPartitioningLabel:
      mutation.partitioning === false
        ? undefined
        : describePartitioning(mutation.partitioning, state.fields),
    autoFillFields,
  }
}

/** Joins the segment labels, or names an empty by-field selection. */
function describePartitioning(
  segments: Exclude<
    Extract<EditorState["mutation"], { enabled: true }>["partitioning"],
    false
  >,
  fields: EditorField[]
): string {
  return segments.length === 0
    ? "an empty field selection"
    : segments
        .map((segment) => partitionSegmentLabel(segment, fields))
        .join(" / ")
}

/**
 * Applies a write method switch in one step, so the caller commits it once
 * and a single undo restores the previous state. Switching to `"insert"` clears
 * the base path, turns partitioning off and removes the `autoFill` option from
 * the top-level fields that carry it (they stay as DateTime fields). Switching
 * to `"storage"` only sets the method; the base path stays empty.
 *
 * @param state - The current editor state.
 * @param next - The write method to switch to.
 * @returns The new state, or `state` itself when the mutation is disabled or
 *   the method is unchanged.
 */
export function changeWriteMethod(
  state: EditorState,
  next: WriteMethod
): EditorState {
  const { mutation } = state
  if (!mutation.enabled || effectiveWriteMethod(mutation) === next) {
    return state
  }
  if (next === "storage") {
    return { ...state, mutation: { ...mutation, writeMethod: next } }
  }

  return {
    ...state,
    fields: state.fields.map(removeAutoFill),
    mutation: {
      ...mutation,
      writeMethod: next,
      basePath: "",
      partitioning: false,
    },
  }
}

/** Removes `options.autoFill`, dropping an `options` object it leaves empty. */
function removeAutoFill(field: EditorField): EditorField {
  if (field.options?.autoFill === undefined) {
    return field
  }
  const { autoFill: _removed, ...rest } = field.options
  if (Object.keys(rest).length === 0) {
    const { options: _dropped, ...withoutOptions } = field
    return withoutOptions
  }
  return { ...field, options: rest }
}
