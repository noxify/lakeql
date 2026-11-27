import type {
  FieldOptions,
  LoadStrategy,
  PrimitiveType,
  WriteMethod,
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
 * One segment of the by-field partition path, held in the editor state by the
 * stable client-side field `id` rather than by name, so renaming a field keeps
 * its segments attached and two fields with the same name stay unambiguous.
 *
 * `component` is a raw string (not narrowed to the schema's date components) so
 * an imported, possibly invalid, component survives a round trip unchanged and
 * is still flagged by validation.
 */
export interface EditorResolvedPartitionSegment {
  /** The `id` of the referenced field. */
  fieldId: string
  /** Date component, present only for a `field:component` segment. */
  component?: string
}

/**
 * A partition segment imported from an `endpoint.json` whose field name could
 * not be resolved to exactly one top-level field (no such field, or the name is
 * duplicated). It keeps its raw name so validation still flags it and the
 * export writes it back unchanged.
 */
export interface EditorUnresolvedPartitionSegment {
  /** The raw field name exactly as imported. */
  unresolvedName: string
  /** The raw component text, present only for a `name:component` segment. */
  component?: string
}

/**
 * A partition segment in the editor state: either bound to a field by id or an
 * unresolved imported name. Serialized to the name-based `field` /
 * `field:component` string on export.
 */
export type EditorPartitionSegment =
  | EditorResolvedPartitionSegment
  | EditorUnresolvedPartitionSegment

/**
 * Mutation configuration in the editor, modeled with an explicit `enabled`
 * discriminant so the UI can hold a fully-configured-but-disabled state and
 * toggle it without losing values.
 *
 * When disabled it exports as the literal `false`; when enabled it exports as a
 * config object. `partitioning` always carries its effective-default
 * value here so the UI can show it.
 */
export type EditorMutation =
  | { enabled: false }
  | {
      enabled: true
      loadStrategy: LoadStrategy
      /**
       * How the data source writes records. `"insert"` has no base path or
       * partitioning, so the mapping layer omits both on export.
       */
      writeMethod: WriteMethod
      /** Base path; empty and unused while `writeMethod` is `"insert"`. */
      basePath: string
      /**
       * Partitioning mode: `false` (off, flat layout) or the ordered list of
       * by-field partition segments (empty while none is chosen yet). Segments
       * reference fields by id; the mapping layer serializes them to the
       * name-based partition string on export. The write-timestamp `true` mode
       * was removed — a write-timestamp column is now an explicit auto-fill
       * field, not an implicit partitioning mode.
       */
      partitioning: false | EditorPartitionSegment[]
    }

/**
 * The live, UI-facing editor state. A faithful superset of
 * `EndpointDefinitionFormat` that can also represent transient invalid states.
 */
export interface EditorState {
  version: "2.0"
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
 * Creates a fresh, empty editor state for a first-run session: `version "2.0"`,
 * empty metadata, no fields, and mutation disabled.
 *
 * @returns A new {@link EditorState} seeded with the documented defaults.
 */
export function createFreshState(): EditorState {
  return {
    version: "2.0",
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
 * Whether an undo is possible — the cursor is not already at the oldest
 * snapshot.
 *
 * @param history - The history to inspect.
 * @returns `true` when {@link undo} would move the cursor.
 */
export function canUndo(history: HistoryState): boolean {
  return history.cursor > 0
}

/**
 * Whether a redo is possible — the cursor is not already at the newest
 * snapshot.
 *
 * @param history - The history to inspect.
 * @returns `true` when {@link redo} would move the cursor.
 */
export function canRedo(history: HistoryState): boolean {
  return history.cursor < history.snapshots.length - 1
}

/**
 * Moves the cursor one snapshot toward the past, restoring the previous
 * committed state. Clamped at the oldest snapshot: undoing past the start is a
 * no-op that returns an equivalent history.
 *
 * @param history - The history to move the cursor in.
 * @returns A new {@link HistoryState} with the cursor decremented (clamped);
 *   the input is not mutated. The `snapshots` are unchanged (no truncation).
 */
export function undo(history: HistoryState): HistoryState {
  const cursor = Math.max(0, history.cursor - 1)
  return { snapshots: history.snapshots, cursor }
}

/**
 * Moves the cursor one snapshot toward the future, reapplying the next
 * committed state. Clamped at the newest snapshot: redoing past the end is a
 * no-op that returns an equivalent history.
 *
 * @param history - The history to move the cursor in.
 * @returns A new {@link HistoryState} with the cursor incremented (clamped);
 *   the input is not mutated.
 */
export function redo(history: HistoryState): HistoryState {
  const cursor = Math.min(history.snapshots.length - 1, history.cursor + 1)
  return { snapshots: history.snapshots, cursor }
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
  /**
   * Replaces the committed history wholesale, after flushing any pending edit
   * so it is not lost.
   *
   * This is the path undo/redo takes: the caller computes an undone/redone
   * {@link HistoryState} (a cursor move over the same snapshots) and installs
   * it as the new committed history. Any in-flight continuous edit is settled
   * into its snapshot first, so switching the cursor never discards a pending
   * keystroke.
   *
   * @param next - The history to install as the committed history.
   */
  setHistory: (next: HistoryState) => void
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
    setHistory(next) {
      // Settle any in-flight edit into the current committed history first, so
      // a pending keystroke is not lost when the history is replaced.
      cancel()
      commitPending()
      committed = next
    },
    get history() {
      // While an edit is pending, show it at the cursor without yet committing.
      return pending === null ? committed : replaceCurrent(committed, pending)
    },
  }
}
