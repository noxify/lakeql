import { createCollection, localStorageCollectionOptions } from "@tanstack/db"

import type { EditorState } from "./model"
import { createFreshState } from "./model"

/**
 * A persisted draft record. The collection is keyed by {@link id} and holds the
 * live {@link EditorState} (not the history cursor), so a reload restores
 * exactly what the user last saw — including edits made inside the debounce
 * window, before a history snapshot committed.
 *
 * The record shape intentionally supports more than one row so multiple named
 * drafts can be added later without a model change; iteration 1 uses a single
 * well-known {@link ACTIVE_DRAFT_ID}.
 */
export interface DraftRecord {
  /** Stable draft identity. */
  id: string
  /** The live editor state for this draft. */
  state: EditorState
  /** Last-write timestamp (epoch ms), for future multi-draft ordering. */
  updatedAt: number
}

/**
 * The id of the single active draft this iteration persists.
 */
export const ACTIVE_DRAFT_ID = "active"

/**
 * The localStorage key under which the drafts collection is stored.
 */
export const STORAGE_KEY = "lakeql:studio:drafts"

/**
 * The debounce window (ms) for autosave of the live state.
 */
export const AUTOSAVE_DEBOUNCE_MS = 300

/**
 * The minimal `Storage` surface the persistence layer needs. Matches the
 * `localStorage` interface so the real one, `sessionStorage`, or a test double
 * all satisfy it.
 */
export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/**
 * The event-target surface used to register best-effort flush handlers on
 * `visibilitychange`/`pagehide`. Matches `window`.
 */
export interface FlushEventTarget {
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/**
 * A scheduler abstraction so autosave debouncing can run on real timers in the
 * browser and on controllable timers in tests.
 */
export interface PersistenceScheduler {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

/**
 * Options for {@link createPersistence}. All are optional; the defaults wire the
 * real browser globals when present.
 */
export interface PersistenceOptions {
  /** Storage backend. Defaults to `localStorage` when available. */
  storage?: StorageLike
  /** Target for flush handlers. Defaults to `window` when available. */
  eventTarget?: FlushEventTarget
  /** Debounce window for autosave. Defaults to {@link AUTOSAVE_DEBOUNCE_MS}. */
  debounceMs?: number
  /** Scheduler for the debounce. Defaults to real timers. */
  scheduler?: PersistenceScheduler
  /** Draft id to persist. Defaults to {@link ACTIVE_DRAFT_ID}. */
  draftId?: string
  /**
   * Sink for the non-blocking storage-failure warning. Defaults to
   * `console.warn`.
   */
  onWarning?: (message: string, cause?: unknown) => void
}

/**
 * A live persistence handle for the active draft.
 */
export interface Persistence {
  /**
   * Records the latest live state and schedules a debounced autosave. Safe to
   * call on every keystroke.
   *
   * @param state - The live editor state to persist.
   */
  save: (state: EditorState) => void
  /**
   * Persists any pending state immediately, bypassing the debounce. Wired to
   * `visibilitychange`/`pagehide` so a reload or tab-close never drops the last
   * edit. Also callable directly.
   */
  flush: () => void
  /**
   * Restores the persisted live state, or a fresh state when nothing is stored
   * (or when storage is unavailable).
   *
   * @returns The restored or freshly seeded editor state.
   */
  restore: () => EditorState
  /**
   * Whether persistence degraded to in-memory because storage was unavailable
   * or rejected a write.
   */
  readonly degraded: boolean
  /**
   * Subscribes to the one-way transition into the degraded state.
   *
   * Degradation can happen after mount — a `save` that only fails once storage
   * fills up or is denied mid-session flips {@link degraded} without any other
   * signal. A reactive consumer (the React hook) subscribes here so it can
   * re-render and surface the non-blocking warning when that happens, instead
   * of polling the getter. The listener fires at most once (degradation is
   * one-way); if the layer is already degraded when you subscribe it is invoked
   * immediately.
   *
   * @param listener - Called when the layer transitions into (or is already in)
   *   the degraded state.
   * @returns An unsubscribe function.
   */
  onDegraded: (listener: () => void) => () => void
  /** Releases timers and event listeners. */
  dispose: () => void
}

const defaultScheduler: PersistenceScheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
}

/**
 * Resolves the browser `localStorage` if it is both present and usable, or
 * `null` otherwise. A probe write guards against environments where the API
 * exists but throws (private mode, quota, denied access).
 */
function resolveBrowserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") {
      return null
    }
    const probe = "__lakeql_studio_probe__"
    localStorage.setItem(probe, "1")
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

/**
 * Creates the `@tanstack/db` localStorage collection that holds draft records.
 * Extracted so its inferred return type names the collection type precisely.
 */
function createDraftCollection(draftId: string, storage: StorageLike) {
  const collection = createCollection(
    localStorageCollectionOptions<DraftRecord>({
      id: `lakeql-studio-drafts-${draftId}`,
      storageKey: STORAGE_KEY,
      storage,
      getKey: (record) => record.id,
    })
  )
  // Sync synchronously from storage so an existing draft is readable
  // immediately on load (a fresh collection is otherwise `idle` until an async
  // preload). This is also what makes same-session reads reflect writes at
  // once.
  collection.startSyncImmediate()
  return collection
}

type DraftCollection = ReturnType<typeof createDraftCollection>

/**
 * Strips the `$`-prefixed metadata that `@tanstack/db` attaches to rows so the
 * restored record is a plain {@link DraftRecord}.
 */
function stripRowMetadata(row: Record<string, unknown>): DraftRecord {
  const { id, state, updatedAt } = row as Partial<DraftRecord>
  return {
    id: String(id),
    state: state as EditorState,
    updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
  }
}

/**
 * Creates the persistence layer for the active draft, backed by a
 * `@tanstack/db` localStorage collection.
 *
 * The collection holds the live {@link EditorState}; {@link Persistence.save}
 * debounces writes and {@link Persistence.flush} (also bound to
 * `visibilitychange`/`pagehide`) writes synchronously, so a reload mid-typing —
 * inside the debounce window, before a history snapshot commits — still restores
 * the last edit.
 *
 * When storage is unavailable or a write is rejected (full, denied, private
 * mode), the layer degrades to in-memory: it keeps the latest state so the
 * running session works, emits a single non-blocking warning, and reports
 * {@link Persistence.degraded}. It never throws to the caller for a storage
 * failure.
 *
 * @param options - See {@link PersistenceOptions}.
 * @returns A {@link Persistence} handle.
 */
export function createPersistence(
  options: PersistenceOptions = {}
): Persistence {
  const draftId = options.draftId ?? ACTIVE_DRAFT_ID
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS
  const scheduler = options.scheduler ?? defaultScheduler
  const warn =
    options.onWarning ??
    ((message, cause) => {
      // A deliberate, non-blocking user warning for storage degradation; the
      // sink is overridable via `onWarning`.
      // eslint-disable-next-line no-console
      console.warn(message, cause)
    })

  const storage =
    options.storage ??
    (typeof window === "undefined" ? undefined : resolveBrowserStorage()) ??
    undefined

  const eventTarget =
    options.eventTarget ??
    (typeof window === "undefined"
      ? undefined
      : (window as unknown as FlushEventTarget))

  let degraded = false
  // In-memory mirror, always kept current so a degraded session still works and
  // so flush() can persist the latest value.
  let latest: EditorState | null = null
  let pending = false
  let handle: unknown = null
  // Subscribers notified on the one-way transition into the degraded state, so
  // a post-mount storage failure surfaces reactively rather than being read off
  // the getter during render.
  const degradedListeners = new Set<() => void>()

  function markDegraded(message: string, cause?: unknown): void {
    if (!degraded) {
      degraded = true
      warn(`[lakeql/studio] ${message}`, cause)
      for (const listener of degradedListeners) {
        listener()
      }
    }
  }

  // Wrap the backing storage so a rejected write (full/denied) is detected and
  // degrades the session. `@tanstack/db` logs such a failure internally but
  // does not surface it to the caller, so the guard is how we learn of it.
  const guardedStorage: StorageLike | undefined =
    storage === undefined
      ? undefined
      : {
          getItem: (key) => storage.getItem(key),
          setItem: (key, value) => {
            try {
              storage.setItem(key, value)
            } catch (error) {
              markDegraded(
                "Could not save your draft to local storage; it will be kept only for this session.",
                error
              )
              throw error
            }
          },
          removeItem: (key) => {
            storage.removeItem(key)
          },
        }

  // Build the collection only when storage is usable. A failure here degrades
  // rather than throwing.
  let collection: DraftCollection | null = null
  if (guardedStorage === undefined) {
    markDegraded(
      "Local storage is unavailable; your draft will be kept only for this session."
    )
  } else {
    try {
      collection = createDraftCollection(draftId, guardedStorage)
    } catch (error) {
      collection = null
      markDegraded(
        "Could not initialize local persistence; your draft will be kept only for this session.",
        error
      )
    }
  }

  function writeNow(state: EditorState): void {
    if (collection === null) {
      return
    }
    const record: DraftRecord = {
      id: draftId,
      state,
      updatedAt: Date.now(),
    }
    try {
      if (collection.has(draftId)) {
        collection.update(draftId, (draft) => {
          draft.state = record.state
          draft.updatedAt = record.updatedAt
        })
      } else {
        collection.insert(record)
      }
    } catch (error) {
      markDegraded(
        "Could not save your draft to local storage; it will be kept only for this session.",
        error
      )
    }
  }

  function cancelTimer(): void {
    if (handle !== null) {
      scheduler.clearTimeout(handle)
      handle = null
    }
  }

  function flush(): void {
    cancelTimer()
    if (pending && latest !== null) {
      writeNow(latest)
      pending = false
    }
  }

  // Best-effort synchronous flush on tab hide / navigation.
  const flushListener = (): void => {
    flush()
  }

  // Whether the flush listeners are currently attached. Guarding attach/detach
  // with this flag makes both idempotent: React StrictMode double-invokes the
  // dispose/remount cycle in dev, and without the guard the first simulated
  // unmount would detach the listeners from this still-live instance and never
  // re-add them, silently weakening the flush. `ensureFlushListeners` re-arms
  // them on the next write after such a remount.
  let flushAttached = false

  function attachFlushListeners(): void {
    if (flushAttached || eventTarget === undefined) {
      return
    }
    eventTarget.addEventListener("visibilitychange", flushListener)
    eventTarget.addEventListener("pagehide", flushListener)
    flushAttached = true
  }

  function detachFlushListeners(): void {
    if (!flushAttached || eventTarget === undefined) {
      return
    }
    eventTarget.removeEventListener("visibilitychange", flushListener)
    eventTarget.removeEventListener("pagehide", flushListener)
    flushAttached = false
  }

  function save(state: EditorState): void {
    // Re-arm the flush listeners if a prior dispose (e.g. a StrictMode remount)
    // detached them, so the best-effort synchronous flush keeps working.
    attachFlushListeners()
    latest = state
    pending = true
    cancelTimer()
    handle = scheduler.setTimeout(() => {
      handle = null
      flush()
    }, debounceMs)
  }

  attachFlushListeners()

  function restore(): EditorState {
    if (collection === null) {
      return latest ?? createFreshState()
    }
    try {
      const row = collection.get(draftId)
      if (row === undefined) {
        return latest ?? createFreshState()
      }
      const record = stripRowMetadata(row as unknown as Record<string, unknown>)
      latest = record.state
      return record.state
    } catch (error) {
      markDegraded(
        "Could not read your saved draft; starting from the last in-memory state.",
        error
      )
      return latest ?? createFreshState()
    }
  }

  function onDegraded(listener: () => void): () => void {
    if (degraded) {
      // Already degraded (e.g. an init-time storage failure): notify at once so
      // a late subscriber still surfaces the warning.
      listener()
      return () => {
        /* no-op: nothing was registered */
      }
    }
    degradedListeners.add(listener)
    return () => {
      degradedListeners.delete(listener)
    }
  }

  function dispose(): void {
    cancelTimer()
    detachFlushListeners()
  }

  return {
    save,
    flush,
    restore,
    get degraded() {
      return degraded
    },
    onDegraded,
    dispose,
  }
}
