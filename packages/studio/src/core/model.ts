import type {
  FieldOptions,
  LoadStrategy,
  PrimitiveType,
} from "@lakeql/schema-generator/endpoint-schema"

/**
 * The set of types a field may take in the editor: the schema primitives plus
 * the two structural kinds. Mirrors the discriminant of `FieldDefinition`.
 */
export type EditorFieldType = PrimitiveType | "Object" | "Array"

/**
 * The type an `Array` field's items may take: any primitive, or a nested
 * `Object`. The schema forbids `Array` of `Array`, so it is absent here.
 */
export type EditorArrayItemType = PrimitiveType | "Object"

/**
 * A single field in the editor tree.
 *
 * `EditorField` is a faithful superset of the schema's `FieldDefinition`: it
 * carries the same authoring data plus a stable client-side {@link id} used for
 * React keys, selection, and tree operations. The `id` is never exported — the
 * mapping layer strips it when producing the definition.
 *
 * Unlike the schema's discriminated union, this type keeps `fields` and `items`
 * as plain optional members so the editor can hold transient, not-yet-valid
 * states the schema would reject (for example a freshly added `Object` with
 * zero children).
 */
export interface EditorField {
  /** Stable client-side identity. Not part of the exported definition. */
  id: string
  /** Field name. May be empty while the user is still typing it. */
  name: string
  /** The field's type. */
  type: EditorFieldType
  /** Child fields, present for `Object` fields. */
  fields?: EditorField[]
  /** Item descriptor, present for `Array` fields. */
  items?: EditorArrayItem
  /** Per-field options (required/readOnly/validations). */
  options?: FieldOptions
}

/**
 * The item descriptor of an `Array` field. When `type` is `Object` it carries
 * its own recursive {@link EditorField} children.
 */
export interface EditorArrayItem {
  /** The array item's type. Never `Array`. */
  type: EditorArrayItemType
  /** Child fields, present when the item type is `Object`. */
  fields?: EditorField[]
}

/**
 * Mutation configuration in the editor, modeled with an explicit `enabled`
 * discriminant so the UI can hold a fully-configured-but-disabled state and
 * toggle it without losing values.
 *
 * When disabled it exports as the literal `false`; when enabled it exports as a
 * config object. `partitioning`/`partitioningFormat` always carry their
 * effective-default values here so the UI can show them; the mapping layer
 * omits them from the export when they equal the runtime defaults.
 */
export type EditorMutation =
  | { enabled: false }
  | {
      enabled: true
      loadStrategy: LoadStrategy
      basePath: string
      /**
       * Partitioning mode: `true` (by write timestamp), `false` (off), or a
       * field/custom string.
       */
      partitioning: boolean | string
      /**
       * Partition granularity, relevant only in non-custom modes. Always held
       * so the control has a value to show; omitted on export when it equals
       * the effective default.
       */
      partitioningFormat: string
    }

/**
 * The live, UI-facing editor state. A faithful superset of
 * `EndpointDefinitionFormat` that can also represent transient invalid states.
 */
export interface EditorState {
  version: "1.0"
  tableName: string
  catalog: string
  schema: string
  /** Free-text data source. An empty string means "omit on export". */
  dataSource: string
  fields: EditorField[]
  mutation: EditorMutation
}

/**
 * A bounded history of immutable editor-state snapshots plus the index of the
 * active one. Prepared so undo/redo can later be a cursor move with no model
 * change; iteration 1 renders only the snapshot at `cursor`.
 */
export interface HistoryState {
  /** Snapshots ordered oldest → newest. */
  snapshots: EditorState[]
  /** Index of the active snapshot within {@link snapshots}. */
  cursor: number
}

/**
 * The effective runtime default for `partitioning` when the key is absent from
 * a mutation config: partition by write timestamp.
 */
export const DEFAULT_PARTITIONING = true

/**
 * The effective runtime default for `partitioningFormat` when the key is absent
 * from a mutation config.
 */
export const DEFAULT_PARTITIONING_FORMAT = "year/month/day"

/**
 * The maximum number of snapshots the in-memory history retains. Pushing past
 * the cap drops the oldest snapshot so memory and persistence work stay
 * bounded.
 */
export const HISTORY_CAP = 100

/**
 * The default debounce window, in milliseconds, after which a continuous text
 * edit is coalesced into a single committed history snapshot.
 */
export const COMMIT_DEBOUNCE_MS = 400

/**
 * A small, non-cryptographic client-side id generator for editor fields.
 *
 * @returns A unique string id for a field within the current session.
 */
export function createFieldId(): string {
  const suffix = idCounter.toString(36)
  idCounter += 1
  return `f_${Math.random().toString(36).slice(2, 10)}${suffix}`
}

let idCounter = 0

/**
 * Creates a fresh, empty editor state for a first-run session: `version "1.0"`,
 * empty metadata, no fields, and mutation disabled.
 *
 * @returns A new {@link EditorState} seeded with the documented defaults.
 */
export function createFreshState(): EditorState {
  return {
    version: "1.0",
    tableName: "",
    catalog: "",
    schema: "",
    dataSource: "",
    fields: [],
    mutation: { enabled: false },
  }
}

/**
 * Creates a fresh history seeded with a single fresh-state snapshot.
 *
 * @returns A new {@link HistoryState} whose only snapshot is a fresh state.
 */
export function createFreshHistory(): HistoryState {
  return { snapshots: [createFreshState()], cursor: 0 }
}

/**
 * Returns the active snapshot of a history (the live state rendered by the UI).
 *
 * @param history - The history to read the active snapshot from.
 * @returns The {@link EditorState} at the history cursor.
 */
export function currentState(history: HistoryState): EditorState {
  const snapshot = history.snapshots[history.cursor]
  if (snapshot === undefined) {
    throw new Error("History cursor is out of range")
  }
  return snapshot
}

/**
 * Commits a new snapshot to the history as a discrete, immediate change.
 *
 * Any snapshots ahead of the cursor (a redo stack from a prior undo) are
 * discarded, the new state is appended, and the oldest snapshot is dropped once
 * the history exceeds {@link HISTORY_CAP}. The cursor moves to the new tail.
 *
 * @param history - The history to extend.
 * @param next - The new live state to record.
 * @returns A new {@link HistoryState}; the input is not mutated.
 */
export function commitSnapshot(
  history: HistoryState,
  next: EditorState
): HistoryState {
  const kept = history.snapshots.slice(0, history.cursor + 1)
  kept.push(next)
  const capped =
    kept.length > HISTORY_CAP ? kept.slice(kept.length - HISTORY_CAP) : kept
  return { snapshots: capped, cursor: capped.length - 1 }
}

/**
 * Replaces the active snapshot in place without adding a new history entry.
 *
 * Used for the live, per-keystroke update of a continuous text edit: the
 * rendered state reflects every keystroke, but no snapshot is pushed until the
 * edit settles (see {@link coalesceEdit}).
 *
 * @param history - The history whose active snapshot is replaced.
 * @param next - The new live state to show at the cursor.
 * @returns A new {@link HistoryState}; the input is not mutated.
 */
export function replaceCurrent(
  history: HistoryState,
  next: EditorState
): HistoryState {
  const snapshots = [...history.snapshots]
  snapshots[history.cursor] = next
  return { snapshots, cursor: history.cursor }
}

/**
 * A debouncing coalescer for continuous text edits. The live state updates on
 * every call; a history snapshot is committed only once the edits settle (after
 * {@link COMMIT_DEBOUNCE_MS} of idle) or when {@link CoalescingCommitter.flush}
 * is called (for example on blur). Rapid typing yields one snapshot per settled
 * edit, not one per keystroke.
 */
export interface CoalescingCommitter {
  /**
   * Records a live edit. Replaces the active snapshot immediately and schedules
   * a coalesced commit after the debounce window.
   *
   * @param next - The new live state produced by the edit.
   */
  edit: (next: EditorState) => void
  /**
   * Commits any pending edit immediately (for example on blur), cancelling the
   * scheduled debounce. A no-op when nothing is pending.
   */
  flush: () => void
  /** The current history, reflecting live edits and committed snapshots. */
  readonly history: HistoryState
}

/**
 * A minimal scheduler abstraction so the coalescer can be driven by real timers
 * in the browser and by fake/synchronous timers in tests.
 */
export interface CommitScheduler {
  /** Schedules `fn` to run after `ms` milliseconds; returns a cancel handle. */
  setTimeout: (fn: () => void, ms: number) => unknown
  /** Cancels a handle returned by {@link CommitScheduler.setTimeout}. */
  clearTimeout: (handle: unknown) => void
}

const defaultScheduler: CommitScheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
}

/**
 * Creates a {@link CoalescingCommitter} over a starting history.
 *
 * Live edits replace the active snapshot immediately and (re)arm a debounce;
 * when the debounce fires or {@link CoalescingCommitter.flush} is called, the
 * latest live state is committed as a single snapshot.
 *
 * @param initial - The history the committer starts from.
 * @param options - Optional debounce window and scheduler (for testing).
 * @returns A committer whose `history` reflects edits and committed snapshots.
 */
export function createCoalescingCommitter(
  initial: HistoryState,
  options: { debounceMs?: number; scheduler?: CommitScheduler } = {}
): CoalescingCommitter {
  const debounceMs = options.debounceMs ?? COMMIT_DEBOUNCE_MS
  const scheduler = options.scheduler ?? defaultScheduler

  // The committed history: snapshots at or before the last settled edit.
  let committed = initial
  // The live state shown during an in-flight edit, not yet its own snapshot.
  let pending: EditorState | null = null
  let handle: unknown = null

  function cancel(): void {
    if (handle !== null) {
      scheduler.clearTimeout(handle)
      handle = null
    }
  }

  function commitPending(): void {
    if (pending === null) {
      return
    }
    committed = commitSnapshot(committed, pending)
    pending = null
  }

  return {
    edit(next) {
      pending = next
      cancel()
      handle = scheduler.setTimeout(() => {
        handle = null
        commitPending()
      }, debounceMs)
    },
    flush() {
      cancel()
      commitPending()
    },
    get history() {
      // While an edit is pending, show it at the cursor without yet committing.
      return pending === null ? committed : replaceCurrent(committed, pending)
    },
  }
}
