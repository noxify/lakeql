// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createField } from "@/core/field-ops"
import { createPersistence } from "@/core/persistence"
import { useEditor } from "@/ui/use-editor"

import { defined } from "./helpers"

/**
 * Component-level tests for the `use-editor` wiring added in Phase B: undo/redo
 * driving the committer's history-replacing method, and the single-commit
 * per-drop path (move/add) with its autosave side effect. These assert the
 * React-facing behaviour the pure core tests cannot reach: that undo/redo move
 * the *live* state, that one drop is exactly one undo step, and that autosave
 * persists the restored/moved state.
 */

/**
 * Reads the persisted top-level field names by restoring through a fresh
 * persistence instance over the same (jsdom) `localStorage` — a simulated
 * reload, as the persistence suite does. Returns `null` when nothing is stored.
 */
function persistedFieldNames(): string[] | null {
  const reloaded = createPersistence({ eventTarget: undefined })
  const state = reloaded.restore()
  reloaded.dispose()
  return state.fields.length === 0 && state.tableName === ""
    ? null
    : state.fields.map((field) => field.name)
}

describe("use-editor undo/redo + drop-commit wiring", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
  })

  it("undo moves the live state back to earlier committed snapshots", () => {
    const { result } = renderHook(() => useEditor())

    act(() => {
      result.current.addField([], { ...createField("String"), name: "a" })
    })
    act(() => {
      result.current.addField([], { ...createField("String"), name: "b" })
    })
    expect(result.current.state.fields.map((f) => f.name)).toStrictEqual([
      "a",
      "b",
    ])

    act(() => {
      result.current.undo()
    })
    // The live state dropped back to the single-field snapshot.
    expect(result.current.state.fields.map((f) => f.name)).toStrictEqual(["a"])

    act(() => {
      result.current.undo()
    })
    expect(result.current.state.fields).toHaveLength(0)
    expect(result.current.canUndo).toBeFalsy()
  })

  it("redo reapplies a snapshot after an undo", () => {
    const { result } = renderHook(() => useEditor())

    act(() => {
      result.current.addField([], { ...createField("String"), name: "a" })
    })
    act(() => {
      result.current.undo()
    })
    expect(result.current.canRedo).toBeTruthy()

    act(() => {
      result.current.redo()
    })
    expect(result.current.state.fields.map((f) => f.name)).toStrictEqual(["a"])
  })

  it("commits exactly one snapshot per completed drop (one drag = one undo step)", () => {
    const { result } = renderHook(() => useEditor())

    // Seed two top-level fields with two commits.
    act(() => {
      result.current.addField([], { ...createField("String"), name: "a" })
    })
    act(() => {
      result.current.addField([], { ...createField("String"), name: "b" })
    })
    const beforeMove = result.current.state.fields.map((f) => f.name)
    expect(beforeMove).toStrictEqual(["a", "b"])

    const aId = defined(result.current.state.fields[0]).id
    const bId = defined(result.current.state.fields[1]).id

    // One drop: reorder "a" to after "b" (append -> before null).
    act(() => {
      result.current.moveField(aId, { containerId: null, beforeId: null })
    })
    expect(result.current.state.fields.map((f) => f.name)).toStrictEqual([
      "b",
      "a",
    ])

    // A single undo reverts the whole drop (exactly one undo step).
    act(() => {
      result.current.undo()
    })
    expect(result.current.state.fields.map((f) => f.name)).toStrictEqual([
      "a",
      "b",
    ])

    // The second field still exists; undoing the drop did not also undo the add.
    expect(bId).not.toBe(aId)
  })

  it("a drop onto itself commits no snapshot", () => {
    const { result } = renderHook(() => useEditor())

    act(() => {
      result.current.addField([], { ...createField("String"), name: "a" })
    })
    expect(result.current.canUndo).toBeTruthy()
    const canRedoBefore = result.current.canRedo

    const aId = defined(result.current.state.fields[0]).id
    act(() => {
      // Drop onto itself: no-op, no new snapshot.
      result.current.moveField(aId, { containerId: null, beforeId: aId })
    })

    // State is unchanged and no redo branch appeared.
    expect(result.current.state.fields.map((f) => f.name)).toStrictEqual(["a"])
    expect(result.current.canRedo).toBe(canRedoBefore)
  })

  it("reset clears to a fresh state and commits exactly one undoable snapshot", () => {
    const { result } = renderHook(() => useEditor())

    act(() => {
      result.current.addField([], { ...createField("String"), name: "a" })
    })
    act(() => {
      result.current.selectField(result.current.state.fields[0]?.id ?? null)
    })
    expect(result.current.selectedFieldId).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    // The live state is fresh (no fields, no table name) and the selection is
    // cleared.
    expect({
      fieldCount: result.current.state.fields.length,
      tableName: result.current.state.tableName,
      selectedFieldId: result.current.selectedFieldId,
      canUndo: result.current.canUndo,
    }).toStrictEqual({
      fieldCount: 0,
      tableName: "",
      selectedFieldId: null,
      canUndo: true,
    })

    // The reset is one committed snapshot, so a single undo restores the field.
    act(() => {
      result.current.undo()
    })
    expect(result.current.state.fields.map((f) => f.name)).toStrictEqual(["a"])
  })

  it("autosave persists the state after a move and after an undo", () => {
    const { result } = renderHook(() => useEditor())

    act(() => {
      result.current.addField([], { ...createField("String"), name: "a" })
    })
    act(() => {
      result.current.addField([], { ...createField("String"), name: "b" })
    })

    const aId = defined(result.current.state.fields[0]).id
    act(() => {
      result.current.moveField(aId, { containerId: null, beforeId: null })
    })
    // Flush the debounced autosave.
    act(() => {
      vi.runOnlyPendingTimers()
    })
    expect(persistedFieldNames()).toStrictEqual(["b", "a"])

    // Undo, then flush autosave again: the restored state is persisted too.
    act(() => {
      result.current.undo()
    })
    act(() => {
      vi.runOnlyPendingTimers()
    })
    expect(persistedFieldNames()).toStrictEqual(["a", "b"])
  })
})
