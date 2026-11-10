import { describe, expect, it } from "vitest"

import type { CommitScheduler, EditorState } from "@/core/model"
import {
  commitSnapshot,
  createCoalescingCommitter,
  createFreshHistory,
  createFreshState,
  currentState,
  HISTORY_CAP,
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
      version: "1.0",
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
})
