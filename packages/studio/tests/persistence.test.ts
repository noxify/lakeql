import { describe, expect, it, vi } from "vitest"

import { fromDefinition } from "@/core/mapping"
import type { EditorState } from "@/core/model"
import { createFreshState } from "@/core/model"
import type {
  FlushEventTarget,
  PersistenceScheduler,
  StorageLike,
} from "@/core/persistence"
import { createPersistence } from "@/core/persistence"

import { defined } from "./helpers"

/** An in-memory Storage double sharable across simulated reloads. */
function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

/** A manual scheduler whose single pending callback a test fires explicitly. */
function manualScheduler(): PersistenceScheduler & { fire: () => void } {
  let scheduled: (() => void) | null = null
  return {
    setTimeout(fn) {
      scheduled = fn
      return 1
    },
    clearTimeout() {
      scheduled = null
    },
    fire() {
      const fn = scheduled
      scheduled = null
      fn?.()
    },
  }
}

/** A controllable event target that can dispatch a named event. */
function fakeEventTarget(): FlushEventTarget & {
  dispatch: (type: string) => void
} {
  const listeners = new Map<string, Set<() => void>>()
  return {
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set<() => void>()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type) {
      for (const listener of listeners.get(type) ?? []) {
        listener()
      }
    },
  }
}

function stateNamed(name: string): EditorState {
  return { ...createFreshState(), tableName: name }
}

describe("persistence round-trip", () => {
  it("persists a debounced edit and restores it after a simulated reload", () => {
    const storage = fakeStorage()
    const scheduler = manualScheduler()

    const first = createPersistence({
      storage,
      scheduler,
      eventTarget: undefined,
    })
    first.save(stateNamed("events"))
    scheduler.fire() // debounce elapses -> write
    first.dispose()

    // Simulated reload: a fresh instance over the same storage.
    const second = createPersistence({
      storage,
      scheduler,
      eventTarget: undefined,
    })
    expect(second.restore().tableName).toBe("events")
    expect(second.degraded).toBeFalsy()
    second.dispose()
  })

  it("restores a fresh state when nothing was persisted", () => {
    const storage = fakeStorage()
    const persistence = createPersistence({ storage, eventTarget: undefined })
    expect(persistence.restore()).toStrictEqual(createFreshState())
    persistence.dispose()
  })

  it("persists a rich state through the collection", () => {
    const storage = fakeStorage()
    const scheduler = manualScheduler()
    const rich = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "profile",
          type: "Object",
          fields: [{ name: "city", type: "String" }],
        },
      ],
      mutation: { loadStrategy: "append", basePath: "/d" },
    })

    const first = createPersistence({
      storage,
      scheduler,
      eventTarget: undefined,
    })
    first.save(rich)
    scheduler.fire()
    first.dispose()

    const second = createPersistence({
      storage,
      scheduler,
      eventTarget: undefined,
    })
    const restored = second.restore()
    const profile = defined(restored.fields[0])
    expect(profile.type).toBe("Object")
    expect(defined(defined(profile.fields)[0]).name).toBe("city")
    expect(restored.mutation).toMatchObject({ enabled: true, basePath: "/d" })
    second.dispose()
  })
})

describe("mid-typing reload inside the debounce window", () => {
  it("the flush on pagehide saves the last keystroke before any debounce fires", () => {
    const storage = fakeStorage()
    const scheduler = manualScheduler()
    const events = fakeEventTarget()

    const session = createPersistence({
      storage,
      scheduler,
      eventTarget: events,
    })

    // User types; each keystroke calls save(). The debounce has NOT fired yet.
    session.save(stateNamed("u"))
    session.save(stateNamed("us"))
    session.save(stateNamed("users"))
    // Storage is still empty — nothing committed within the debounce window.
    expect(storage.map.size).toBe(0)

    // The tab is hidden / navigates away mid-typing: the flush handler runs.
    events.dispatch("pagehide")
    session.dispose()

    // Reload: the last keystroke survived.
    const reloaded = createPersistence({
      storage,
      scheduler,
      eventTarget: events,
    })
    expect(reloaded.restore().tableName).toBe("users")
    reloaded.dispose()
  })

  it("re-arms the flush listeners after a dispose (StrictMode remount)", () => {
    const storage = fakeStorage()
    const scheduler = manualScheduler()
    const events = fakeEventTarget()

    const session = createPersistence({
      storage,
      scheduler,
      eventTarget: events,
    })

    // Dev StrictMode simulates an immediate unmount after the first mount; the
    // dispose detaches the flush listeners from this still-live instance.
    session.dispose()

    // On the second mount the session keeps being used. A later save re-arms
    // the listeners, so the best-effort flush must still fire.
    session.save(stateNamed("kept"))
    expect(storage.map.size).toBe(0)
    events.dispatch("pagehide")

    const reloaded = createPersistence({
      storage,
      scheduler,
      eventTarget: events,
    })
    expect(reloaded.restore().tableName).toBe("kept")
    reloaded.dispose()
  })

  it("visibilitychange also flushes the pending state", () => {
    const storage = fakeStorage()
    const scheduler = manualScheduler()
    const events = fakeEventTarget()

    const session = createPersistence({
      storage,
      scheduler,
      eventTarget: events,
    })
    session.save(stateNamed("draft"))
    events.dispatch("visibilitychange")
    session.dispose()

    const reloaded = createPersistence({
      storage,
      scheduler,
      eventTarget: events,
    })
    expect(reloaded.restore().tableName).toBe("draft")
    reloaded.dispose()
  })
})

describe("storage failure degrades gracefully", () => {
  it("falls back to in-memory + a single warning when writes throw", () => {
    const onWarning = vi.fn<(message: string, cause?: unknown) => void>()
    // Storage that rejects writes (quota/denied), but construction succeeds.
    const denying: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
      removeItem: () => {
        /* no-op */
      },
    }
    const scheduler = manualScheduler()

    const session = createPersistence({
      storage: denying,
      scheduler,
      eventTarget: undefined,
      onWarning,
    })

    // Saving must not throw; it degrades.
    expect(() => {
      session.save(stateNamed("x"))
      scheduler.fire()
    }).not.toThrow()

    expect(session.degraded).toBeTruthy()
    expect(onWarning).toHaveBeenCalledOnce()

    // The in-memory mirror still serves the latest state.
    expect(session.restore().tableName).toBe("x")
    session.dispose()
  })

  it("notifies onDegraded subscribers when a write fails after mount", () => {
    const onWarning = vi.fn<(message: string, cause?: unknown) => void>()
    const denying: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
      removeItem: () => {
        /* no-op */
      },
    }
    const scheduler = manualScheduler()
    const session = createPersistence({
      storage: denying,
      scheduler,
      eventTarget: undefined,
      onWarning,
    })

    // Subscribe before any failure: not yet degraded, so no immediate call.
    const degradedListener = vi.fn<() => void>()
    session.onDegraded(degradedListener)
    expect(degradedListener).not.toHaveBeenCalled()

    // A post-subscribe write fails and must notify the subscriber reactively.
    session.save(stateNamed("x"))
    scheduler.fire()
    expect(degradedListener).toHaveBeenCalledOnce()
    session.dispose()
  })

  it("invokes an onDegraded subscriber immediately when already degraded", () => {
    const onWarning = vi.fn<(message: string, cause?: unknown) => void>()
    const session = createPersistence({
      storage: undefined,
      eventTarget: undefined,
      onWarning,
    })
    expect(session.degraded).toBeTruthy()
    const listener = vi.fn<() => void>()
    session.onDegraded(listener)
    expect(listener).toHaveBeenCalledOnce()
    session.dispose()
  })

  it("degrades when storage is entirely unavailable", () => {
    const onWarning = vi.fn<(message: string, cause?: unknown) => void>()
    const session = createPersistence({
      storage: undefined,
      eventTarget: undefined,
      onWarning,
    })
    // With no window and no storage, it degrades at construction.
    expect(session.degraded).toBeTruthy()
    expect(onWarning).toHaveBeenCalledOnce()
    // Still keeps the session alive in memory.
    session.save(stateNamed("y"))
    expect(session.restore().tableName).toBe("y")
    session.dispose()
  })
})
