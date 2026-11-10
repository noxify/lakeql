import { describe, expect, it } from "vitest"

import { fromDefinition } from "@/core/mapping"
import type { EditorState } from "@/core/model"
import { flattenVisible, nextFocusId } from "@/ui/tree-nav"

import { defined } from "./helpers"

/**
 * A nested definition: a top-level primitive, an `Object` with two children,
 * and an `Array`-of-`Object` with one child. Exercises every container kind the
 * flattener must descend into.
 */
function nestedState(): EditorState {
  return fromDefinition({
    version: "1.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [
      { name: "id", type: "String" },
      {
        name: "profile",
        type: "Object",
        fields: [
          { name: "city", type: "String" },
          { name: "zip", type: "String" },
        ],
      },
      {
        name: "tags",
        type: "Array",
        items: {
          type: "Object",
          fields: [{ name: "label", type: "String" }],
        },
      },
    ],
    mutation: false,
  })
}

const alwaysExpanded = (): boolean => true

describe("flattening visible tree rows", () => {
  it("flattens the full tree in document order with correct levels", () => {
    const rows = flattenVisible(nestedState().fields, alwaysExpanded)
    expect(rows.map((r) => r.level)).toStrictEqual([1, 1, 2, 2, 1, 2])
  })

  it("marks containers expandable and primitives not", () => {
    const rows = flattenVisible(nestedState().fields, alwaysExpanded)
    // id (primitive), profile (Object), ...children, tags (Array<Object>)
    expect(defined(rows[0]).expandable).toBeFalsy()
    expect(defined(rows[1]).expandable).toBeTruthy()
    expect(defined(rows[4]).expandable).toBeTruthy()
  })

  it("records parent ids so ArrowLeft can step out", () => {
    const state = nestedState()
    const rows = flattenVisible(state.fields, alwaysExpanded)
    const profileId = defined(state.fields[1]).id
    // profile's two children point back at profile.
    expect(defined(rows[2]).parentId).toBe(profileId)
    expect(defined(rows[3]).parentId).toBe(profileId)
    expect(defined(rows[0]).parentId).toBeNull()
  })

  it("hides the descendants of a collapsed container", () => {
    const state = nestedState()
    const profileId = defined(state.fields[1]).id
    const rows = flattenVisible(
      state.fields,
      (id) => id !== profileId // profile is collapsed
    )
    // profile stays, but its two children are gone.
    const ids = rows.map((r) => r.level)
    expect(ids).toStrictEqual([1, 1, 1, 2])
  })
})

describe("tree keyboard focus movement", () => {
  it("moves down and up through visible rows, clamping at the ends", () => {
    const state = nestedState()
    const rows = flattenVisible(state.fields, alwaysExpanded)
    const firstId = defined(rows[0]).id
    const secondId = defined(rows[1]).id
    const lastId = defined(rows.at(-1)).id

    expect(nextFocusId(rows, firstId, "ArrowDown")).toBe(secondId)
    expect(nextFocusId(rows, firstId, "ArrowUp")).toBe(firstId)
    expect(nextFocusId(rows, lastId, "ArrowDown")).toBe(lastId)
  })

  it("jumps to the first/last row with Home/End", () => {
    const state = nestedState()
    const rows = flattenVisible(state.fields, alwaysExpanded)
    const firstId = defined(rows[0]).id
    const lastId = defined(rows.at(-1)).id
    expect(nextFocusId(rows, lastId, "Home")).toBe(firstId)
    expect(nextFocusId(rows, firstId, "End")).toBe(lastId)
  })

  it("ArrowRight on an expanded container steps to its first child", () => {
    const state = nestedState()
    const rows = flattenVisible(state.fields, alwaysExpanded)
    const profileId = defined(state.fields[1]).id
    const firstChildId = defined(defined(state.fields[1]).fields)[0]?.id
    expect(nextFocusId(rows, profileId, "ArrowRight")).toBe(firstChildId)
  })

  it("ArrowRight reports no move for a leaf (caller handles expand)", () => {
    const state = nestedState()
    const rows = flattenVisible(state.fields, alwaysExpanded)
    const leafId = defined(rows[0]).id // the top-level primitive "id"
    expect(nextFocusId(rows, leafId, "ArrowRight")).toBeNull()
  })

  it("ArrowLeft steps out to the parent", () => {
    const state = nestedState()
    const rows = flattenVisible(state.fields, alwaysExpanded)
    const profileId = defined(state.fields[1]).id
    const firstChildId = defined(defined(defined(state.fields[1]).fields)[0]).id
    expect(nextFocusId(rows, firstChildId, "ArrowLeft")).toBe(profileId)
  })

  it("falls back to the first row when the current id is unknown", () => {
    const state = nestedState()
    const rows = flattenVisible(state.fields, alwaysExpanded)
    expect(nextFocusId(rows, "missing", "ArrowDown")).toBe(defined(rows[0]).id)
  })

  it("returns null for an empty tree", () => {
    expect(nextFocusId([], null, "ArrowDown")).toBeNull()
  })
})
