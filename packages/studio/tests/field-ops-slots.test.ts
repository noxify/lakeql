import { describe, expect, it } from "vitest"

import {
  addField,
  createField,
  enumerateMoveSlots,
  planMove,
} from "@/core/field-ops"
import { fromDefinition } from "@/core/mapping"
import type { EditorState } from "@/core/model"

import { defined } from "./helpers"

function baseState(): EditorState {
  return fromDefinition({
    version: "2.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [],
    mutation: false,
  })
}

/** The id of the top-level field at `index`. */
function topId(state: EditorState, index: number): string {
  return defined(state.fields[index]).id
}

describe("enumerateMoveSlots — ordered candidate insert positions", () => {
  it("yields a single append slot for an empty top level", () => {
    expect(enumerateMoveSlots(baseState())).toStrictEqual([
      { containerId: null, beforeId: null },
    ])
  })

  it("yields a before-slot per sibling plus a trailing append slot at the top level", () => {
    let state = addField(baseState(), [], {
      ...createField("String"),
      name: "a",
    })
    state = addField(state, [], { ...createField("String"), name: "b" })
    const aId = topId(state, 0)
    const bId = topId(state, 1)

    expect(enumerateMoveSlots(state)).toStrictEqual([
      { containerId: null, beforeId: aId },
      { containerId: null, beforeId: bId },
      { containerId: null, beforeId: null },
    ])
  })

  it("walks nested Object and Array-of-Object containers in reading order", () => {
    // Top: [ id(String), profile(Object{ city }), items(Array<Object>{ sku }) ]
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        { name: "id", type: "String" },
        {
          name: "profile",
          type: "Object",
          fields: [{ name: "city", type: "String" }],
        },
        {
          name: "items",
          type: "Array",
          items: { type: "Object", fields: [{ name: "sku", type: "String" }] },
        },
      ],
      mutation: false,
    })

    const id = topId(state, 0)
    const profile = topId(state, 1)
    const items = topId(state, 2)
    const [city] = defined(defined(state.fields[1]).fields)
    const [sku] = defined(defined(state.fields[2]).items?.fields)

    expect(enumerateMoveSlots(state)).toStrictEqual([
      // top level, before id
      { containerId: null, beforeId: id },
      // top level, before profile
      { containerId: null, beforeId: profile },
      // inside profile, before city
      { containerId: profile, beforeId: defined(city).id },
      // inside profile, append
      { containerId: profile, beforeId: null },
      // top level, before items
      { containerId: null, beforeId: items },
      // inside items' object, before sku
      { containerId: items, beforeId: defined(sku).id },
      // inside items' object, append
      { containerId: items, beforeId: null },
      // top level, append
      { containerId: null, beforeId: null },
    ])
  })

  it("offers no inner slot for a primitive or an Array-of-primitive (non-containers)", () => {
    let state = addField(baseState(), [], {
      ...createField("String"),
      name: "s",
    })
    state = addField(state, [], { ...createField("Array"), name: "arr" }) // Array<String>
    const sId = topId(state, 0)
    const arrId = topId(state, 1)

    const slots = enumerateMoveSlots(state)
    // No slot has a non-container field as its container.
    expect(slots.some((slot) => slot.containerId === sId)).toBeFalsy()
    expect(slots.some((slot) => slot.containerId === arrId)).toBeFalsy()
    // Only the three top-level slots exist.
    expect(slots).toStrictEqual([
      { containerId: null, beforeId: sId },
      { containerId: null, beforeId: arrId },
      { containerId: null, beforeId: null },
    ])
  })

  it("every emitted slot is accepted by planMove for a trivially movable field", () => {
    // A lone top-level primitive is trivially movable: it is not a container,
    // so no slot can be self-containing, and moving it never empties a nested
    // source container.
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        { name: "mover", type: "String" },
        {
          name: "profile",
          type: "Object",
          fields: [{ name: "city", type: "String" }],
        },
        {
          name: "items",
          type: "Array",
          items: { type: "Object", fields: [{ name: "sku", type: "String" }] },
        },
      ],
      mutation: false,
    })
    const moverId = topId(state, 0)

    for (const slot of enumerateMoveSlots(state)) {
      expect(planMove(state, moverId, slot).ok).toBeTruthy()
    }
  })
})
