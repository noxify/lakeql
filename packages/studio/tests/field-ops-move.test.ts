import { describe, expect, it } from "vitest"

import {
  addField,
  createField,
  findContainerPath,
  findFieldPath,
  moveField,
  planMove,
} from "@/core/field-ops"
import { fromDefinition } from "@/core/mapping"
import type { EditorState } from "@/core/model"

import { defined } from "./helpers"

function baseState(): EditorState {
  return fromDefinition({
    version: "1.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [],
    mutation: false,
  })
}

/** Appends a named top-level field of the given type, returning the state. */
function appended(
  state: EditorState,
  name: string,
  type: Parameters<typeof createField>[0] = "String"
): EditorState {
  return addField(state, [], { ...createField(type), name })
}

/**
 * Appends a named top-level field and returns both the new state and the
 * field's id, for cases that need to address the field by id.
 */
function appendedWithId(
  state: EditorState,
  name: string,
  type: Parameters<typeof createField>[0] = "String"
): { state: EditorState; id: string } {
  const field = { ...createField(type), name }
  return { state: addField(state, [], field), id: field.id }
}

/** The id of the top-level field at `index`. */
function topId(state: EditorState, index: number): string {
  return defined(state.fields[index]).id
}

/** The ordered top-level field names. */
function topNames(state: EditorState): string[] {
  return state.fields.map((field) => field.name)
}

describe("findContainerPath — container id to path", () => {
  it("maps null to the empty top-level path", () => {
    expect(findContainerPath(baseState(), null)).toStrictEqual([])
  })

  it("resolves a nested Object field to its child-fields path", () => {
    const obj = { ...createField("Object"), name: "obj" }
    const state = addField(baseState(), [], obj)
    expect(findContainerPath(state, obj.id)).toStrictEqual([0])
  })

  it("resolves an Array-of-Object field to its item-fields path", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "items",
          type: "Array",
          items: { type: "Object", fields: [{ name: "sku", type: "String" }] },
        },
      ],
      mutation: false,
    })
    expect(findContainerPath(state, topId(state, 0))).toStrictEqual([0])
  })

  it("returns undefined for a primitive (not a container)", () => {
    const { state, id } = appendedWithId(baseState(), "x", "String")
    expect(findContainerPath(state, id)).toBeUndefined()
  })

  it("returns undefined for an Array of primitive (not a container)", () => {
    const { state, id } = appendedWithId(baseState(), "a", "Array")
    expect(findContainerPath(state, id)).toBeUndefined()
  })

  it("returns undefined for an unknown id", () => {
    expect(findContainerPath(baseState(), "missing")).toBeUndefined()
  })
})

describe("planMove — structurally-impossible rejections", () => {
  it("rejects a non-container destination", () => {
    // Two top-level primitives; try to move one into the other.
    const first = appendedWithId(baseState(), "a", "String")
    const second = appendedWithId(first.state, "b", "String")
    const plan = planMove(second.state, first.id, {
      containerId: second.id,
      beforeId: null,
    })
    expect(plan.ok).toBeFalsy()
    expect(plan.reason).toContain("not a field-holding container")
  })

  it("rejects an Array-of-Array (array items would become array)", () => {
    // Container is an Array-of-Object; moving an Array field into it makes an
    // array item an array.
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "items",
          type: "Array",
          items: { type: "Object", fields: [{ name: "sku", type: "String" }] },
        },
        { name: "arr", type: "Array", items: { type: "String" } },
      ],
      mutation: false,
    })
    const plan = planMove(state, topId(state, 1), {
      containerId: topId(state, 0),
      beforeId: null,
    })
    expect(plan.ok).toBeFalsy()
    expect(plan.reason).toContain("array")
  })

  it("rejects self-containment (containerId === fromId)", () => {
    const obj = { ...createField("Object"), name: "obj" }
    const state = addField(baseState(), [], obj)
    const plan = planMove(state, obj.id, {
      containerId: obj.id,
      beforeId: null,
    })
    expect(plan.ok).toBeFalsy()
    expect(plan.reason).toContain("into itself")
  })

  it("rejects moving a container into its own descendant", () => {
    // obj > inner (both Objects); move obj into inner.
    let state = addField(baseState(), [], {
      ...createField("Object"),
      name: "obj",
    })
    const inner = { ...createField("Object"), name: "inner" }
    state = addField(state, [0], inner)
    const plan = planMove(state, topId(state, 0), {
      containerId: inner.id,
      beforeId: null,
    })
    expect(plan.ok).toBeFalsy()
    expect(plan.reason).toContain("descendant")
  })
})

describe("planMove — allowed with soft warning", () => {
  it("allows a move that empties the source container, with a warning", () => {
    // obj has a single child; moving it to the top level empties obj.
    let state = addField(baseState(), [], {
      ...createField("Object"),
      name: "obj",
    })
    const child = { ...createField("String"), name: "only" }
    state = addField(state, [0], child)
    const plan = planMove(state, child.id, {
      containerId: null,
      beforeId: null,
    })
    expect(plan.ok).toBeTruthy()
    expect(plan.reason).toContain("empties its source container")
  })

  it("allows a move producing a duplicate name, with a warning", () => {
    // Top-level "dup"; obj holds { dup, keep }. Moving obj.dup to the top level
    // duplicates "dup" there WITHOUT emptying obj (its "keep" child remains),
    // so the surfaced warning is the duplicate-name one.
    let state = addField(baseState(), [], {
      ...createField("String"),
      name: "dup",
    })
    state = addField(state, [], { ...createField("Object"), name: "obj" })
    const child = { ...createField("String"), name: "dup" }
    state = addField(state, [1], child)
    state = addField(state, [1], { ...createField("String"), name: "keep" })
    const plan = planMove(state, child.id, {
      containerId: null,
      beforeId: null,
    })
    expect(plan.ok).toBeTruthy()
    expect(plan.reason).toContain("already has a field with this name")
  })

  it("treats a drop onto the field itself as an ok no-op", () => {
    const { state, id } = appendedWithId(baseState(), "x", "String")
    const plan = planMove(state, id, { containerId: null, beforeId: id })
    expect(plan.ok).toBeTruthy()
    expect(plan.reason).toBeUndefined()
  })
})

describe("moveField — remove-then-insert by id", () => {
  it("reorders within the same level", () => {
    let state = appended(baseState(), "a")
    state = appended(state, "b")
    state = appended(state, "c")
    // Move "c" before "a" at the top level.
    const next = moveField(state, topId(state, 2), {
      containerId: null,
      beforeId: topId(state, 0),
    })
    expect(topNames(next)).toStrictEqual(["c", "a", "b"])
  })

  it("moves cross-level and resolves the destination AFTER source removal (index-shift)", () => {
    // Top level: [leaf, box(Object)]. Moving the leaf at index 0 into box
    // shifts box from index 1 to index 0 after removal. An index-path target
    // would land in the wrong place; id resolution must land it inside box.
    let state = addField(baseState(), [], {
      ...createField("String"),
      name: "leaf",
    })
    const box = { ...createField("Object"), name: "box" }
    state = addField(state, [], box)
    // Give box an existing child so we can assert the leaf lands inside it.
    state = addField(state, [1], { ...createField("String"), name: "seed" })

    const leafId = topId(state, 0)
    const next = moveField(state, leafId, {
      containerId: box.id,
      beforeId: null,
    })

    // Only box remains at the top level.
    expect(topNames(next)).toStrictEqual(["box"])
    // The leaf landed inside box, not at a shifted top-level index.
    const boxChildren = defined(defined(next.fields[0]).fields)
    expect(boxChildren.map((field) => field.name)).toStrictEqual([
      "seed",
      "leaf",
    ])
    // And it is reachable by id inside the container.
    expect(findFieldPath(next.fields, leafId)).toStrictEqual([0, 1])
  })

  it("moves the last child out of a container, emptying it (allowed)", () => {
    let state = addField(baseState(), [], {
      ...createField("Object"),
      name: "obj",
    })
    const child = { ...createField("String"), name: "only" }
    state = addField(state, [0], child)
    const next = moveField(state, child.id, {
      containerId: null,
      beforeId: null,
    })
    // obj is now empty; the child moved to the top level.
    expect(defined(next.fields[0]).fields).toStrictEqual([])
    expect(defined(next.fields[1]).name).toBe("only")
  })

  it("allows a move that produces a duplicate name", () => {
    let state = addField(baseState(), [], {
      ...createField("String"),
      name: "dup",
    })
    state = addField(state, [], { ...createField("Object"), name: "obj" })
    const child = { ...createField("String"), name: "dup" }
    state = addField(state, [1], child)
    const next = moveField(state, child.id, {
      containerId: null,
      beforeId: null,
    })
    expect(topNames(next)).toContain("dup")
    expect(next.fields.filter((f) => f.name === "dup")).toHaveLength(2)
  })

  it("returns the state unchanged on a drop onto itself", () => {
    const { state, id } = appendedWithId(baseState(), "x", "String")
    const next = moveField(state, id, { containerId: null, beforeId: id })
    expect(next).toBe(state)
  })

  it("returns the state unchanged for a structurally-impossible destination that bypasses planMove", () => {
    // A primitive is not a field-holding container, so `findContainerPath`
    // yields `undefined` and the ungated fallback must leave state untouched
    // (callers are expected to gate with `planMove`, but moveField must not
    // throw or corrupt state when reached without that gate).
    const first = appendedWithId(baseState(), "a", "String")
    const second = appendedWithId(first.state, "b", "String")
    const next = moveField(second.state, first.id, {
      containerId: second.id,
      beforeId: null,
    })
    expect(next).toBe(second.state)
  })

  it("returns the state unchanged for an unknown destination container id", () => {
    const { state, id } = appendedWithId(baseState(), "a", "String")
    const next = moveField(state, id, {
      containerId: "missing",
      beforeId: null,
    })
    expect(next).toBe(state)
  })
})

describe("addField positional insert-anchor", () => {
  it("appends when no beforeId is given (back-compatible)", () => {
    let state = appended(baseState(), "a")
    state = appended(state, "b")
    const next = addField(state, [], { ...createField("String"), name: "c" })
    expect(topNames(next)).toStrictEqual(["a", "b", "c"])
  })

  it("inserts before the anchor at the top level", () => {
    let state = appended(baseState(), "a")
    state = appended(state, "b")
    const next = addField(
      state,
      [],
      { ...createField("String"), name: "x" },
      topId(state, 1)
    )
    expect(topNames(next)).toStrictEqual(["a", "x", "b"])
  })

  it("inserts before the anchor in a nested container", () => {
    let state = addField(baseState(), [], {
      ...createField("Object"),
      name: "obj",
    })
    state = addField(state, [0], { ...createField("String"), name: "a" })
    state = addField(state, [0], { ...createField("String"), name: "b" })
    const anchorId = defined(defined(state.fields[0]).fields)[1]?.id ?? null
    const next = addField(
      state,
      [0],
      { ...createField("String"), name: "x" },
      anchorId
    )
    const children = defined(defined(next.fields[0]).fields)
    expect(children.map((field) => field.name)).toStrictEqual(["a", "x", "b"])
  })

  it("appends when the beforeId is not a sibling of the container", () => {
    let state = appended(baseState(), "a")
    state = appended(state, "b")
    const next = addField(
      state,
      [],
      { ...createField("String"), name: "c" },
      "unknown"
    )
    expect(topNames(next)).toStrictEqual(["a", "b", "c"])
  })
})
