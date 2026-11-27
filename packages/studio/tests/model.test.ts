import { describe, expect, it } from "vitest"

import type { CommitScheduler, EditorState } from "@/core/model"
import {
  canRedo,
  canUndo,
  commitSnapshot,
  createCoalescingCommitter,
  createFreshHistory,
  createFreshState,
  currentState,
  HISTORY_CAP,
  redo,
  undo,
} from "@/core/model"

/**
 * A manual scheduler: records the latest scheduled callback so a test can fire
 * it deterministically, standing in for a debounce timer firing.
 */
function manualScheduler(): CommitScheduler & { fire: () => void } {
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

function withName(state: EditorState, name: string): EditorState {
  return { ...state, tableName: name }
}

describe("fresh-state seeding", () => {
  it("seeds version 1.0, empty metadata/fields, mutation disabled", () => {
    expect(createFreshState()).toStrictEqual({
      version: "2.0",
      tableName: "",
      catalog: "",
      schema: "",
      dataSource: "",
      fields: [],
      mutation: { enabled: false },
    })
  })

  it("seeds a history of exactly one fresh snapshot at cursor 0", () => {
    const history = createFreshHistory()
    expect(history.snapshots).toHaveLength(1)
    expect(history.cursor).toBe(0)
    expect(currentState(history)).toStrictEqual(createFreshState())
  })
})

describe("discrete commit", () => {
  it("appends a snapshot and advances the cursor", () => {
    const h0 = createFreshHistory()
    const h1 = commitSnapshot(h0, withName(currentState(h0), "a"))
    expect(h1.snapshots).toHaveLength(2)
    expect(h1.cursor).toBe(1)
    expect(currentState(h1).tableName).toBe("a")
    // Original history is untouched.
    expect(h0.snapshots).toHaveLength(1)
  })
})

describe("history cap", () => {
  it("drops the oldest snapshot once the cap is exceeded", () => {
    let history = createFreshHistory()
    // Push well past the cap.
    for (let i = 0; i < HISTORY_CAP + 25; i += 1) {
      history = commitSnapshot(
        history,
        withName(currentState(history), `n${i}`)
      )
    }
    expect(history.snapshots).toHaveLength(HISTORY_CAP)
    expect(history.cursor).toBe(HISTORY_CAP - 1)
    // The newest edit is retained; the earliest ones are dropped.
    expect(currentState(history).tableName).toBe(`n${HISTORY_CAP + 24}`)
    expect(
      history.snapshots.some((snapshot) => snapshot.tableName === "n0")
    ).toBeFalsy()
  })
})

describe("coalescing committer", () => {
  it("coalesces rapid edits into a single snapshot on debounce", () => {
    const scheduler = manualScheduler()
    const committer = createCoalescingCommitter(createFreshHistory(), {
      debounceMs: 400,
      scheduler,
    })

    const fresh = createFreshState()
    committer.edit(withName(fresh, "u"))
    committer.edit(withName(fresh, "us"))
    committer.edit(withName(fresh, "use"))
    committer.edit(withName(fresh, "users"))

    // While pending, the live state shows the latest edit but no snapshot has
    // committed yet.
    expect(currentState(committer.history).tableName).toBe("users")
    expect(committer.history.snapshots).toHaveLength(1)

    scheduler.fire()

    // One settled snapshot, not one per keystroke.
    expect(committer.history.snapshots).toHaveLength(2)
    expect(currentState(committer.history).tableName).toBe("users")
  })

  it("flush commits immediately (blur) and cancels the debounce", () => {
    const scheduler = manualScheduler()
    const committer = createCoalescingCommitter(createFreshHistory(), {
      scheduler,
    })

    committer.edit(withName(createFreshState(), "x"))
    committer.flush()

    expect(committer.history.snapshots).toHaveLength(2)
    expect(currentState(committer.history).tableName).toBe("x")

    // Firing a stale timer after flush does not double-commit.
    scheduler.fire()
    expect(committer.history.snapshots).toHaveLength(2)
  })

  it("a settled edit followed by another yields two snapshots", () => {
    const scheduler = manualScheduler()
    const committer = createCoalescingCommitter(createFreshHistory(), {
      scheduler,
    })

    committer.edit(withName(createFreshState(), "a"))
    scheduler.fire()
    committer.edit(withName(createFreshState(), "ab"))
    scheduler.fire()

    expect(committer.history.snapshots).toHaveLength(3)
    expect(
      committer.history.snapshots.map((snapshot) => snapshot.tableName)
    ).toStrictEqual(["", "a", "ab"])
  })

  it("setHistory replaces the committed history and flushes a pending edit first", () => {
    const scheduler = manualScheduler()
    const committer = createCoalescingCommitter(createFreshHistory(), {
      scheduler,
    })

    // Build a two-snapshot history ["", "a"].
    committer.edit(withName(createFreshState(), "a"))
    committer.flush()
    const applied = committer.history

    // Start a pending edit that has NOT settled...
    committer.edit(withName(createFreshState(), "pending"))
    // ...then apply an undone history (cursor back to "").
    committer.setHistory({ snapshots: applied.snapshots, cursor: 0 })

    // The pending edit is flushed (not lost): it became its own snapshot before
    // the replacement, so the replaced history is clean and the cursor is at
    // the undone position.
    expect(currentState(committer.history).tableName).toBe("")
    expect(committer.history.cursor).toBe(0)
    expect(committer.history.snapshots).toHaveLength(2)

    // A stale timer firing afterward does not resurrect the pending edit.
    scheduler.fire()
    expect(currentState(committer.history).tableName).toBe("")
  })
})

/** A three-snapshot history ["", "a", "b"] with the cursor at the newest. */
function threeSnapshotHistory() {
  let history = createFreshHistory()
  history = commitSnapshot(history, withName(createFreshState(), "a"))
  history = commitSnapshot(history, withName(createFreshState(), "b"))
  return history
}

describe("undo / redo cursor movers", () => {
  it("undo moves the cursor back, redo moves it forward", () => {
    const h = threeSnapshotHistory() // ["", "a", "b"], cursor 2
    const undone = undo(h)
    expect(undone.cursor).toBe(1)
    expect(currentState(undone).tableName).toBe("a")

    const redone = redo(undone)
    expect(redone.cursor).toBe(2)
    expect(currentState(redone).tableName).toBe("b")
  })

  it("clamps undo at the oldest snapshot", () => {
    const h = createFreshHistory() // cursor 0
    const undone = undo(h)
    expect(undone.cursor).toBe(0)
    expect(canUndo(h)).toBeFalsy()
  })

  it("clamps redo at the newest snapshot", () => {
    const h = threeSnapshotHistory() // cursor 2 (newest)
    const redone = redo(h)
    expect(redone.cursor).toBe(2)
    expect(canRedo(h)).toBeFalsy()
  })

  it("canUndo is true and canRedo false at the newest snapshot", () => {
    const h = threeSnapshotHistory() // cursor 2
    expect(canUndo(h)).toBeTruthy()
    expect(canRedo(h)).toBeFalsy()
  })

  it("both canUndo and canRedo are true in the middle of history", () => {
    const mid = undo(threeSnapshotHistory()) // cursor 1
    expect(canUndo(mid)).toBeTruthy()
    expect(canRedo(mid)).toBeTruthy()
  })

  it("canUndo is false and canRedo true at the oldest snapshot", () => {
    const start = undo(undo(threeSnapshotHistory())) // cursor 0
    expect(canUndo(start)).toBeFalsy()
    expect(canRedo(start)).toBeTruthy()
  })

  it("does not mutate the input history and keeps snapshots intact on undo", () => {
    const h = threeSnapshotHistory()
    const undone = undo(h)
    expect(h.cursor).toBe(2)
    // Undo is a cursor move only — snapshots are not truncated.
    expect(undone.snapshots).toBe(h.snapshots)
    expect(undone.snapshots).toHaveLength(3)
  })

  it("a new commit after an undo truncates the redo branch", () => {
    const h = threeSnapshotHistory() // ["", "a", "b"], cursor 2
    const undone = undo(h) // cursor 1 -> "a"; "b" is now a redo branch
    const committed = commitSnapshot(undone, withName(createFreshState(), "c"))
    // "b" is discarded; "c" replaces the redo branch.
    expect(
      committed.snapshots.map((snapshot) => snapshot.tableName)
    ).toStrictEqual(["", "a", "c"])
    expect(committed.cursor).toBe(2)
    expect(canRedo(committed)).toBeFalsy()
  })
})
