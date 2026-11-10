import { describe, expect, it } from "vitest"

import {
  addField,
  changeArrayItemType,
  changeFieldType,
  createField,
  removeField,
} from "@/core/field-ops"
import { fromDefinition } from "@/core/mapping"
import type { EditorState } from "@/core/model"
import { createFreshState } from "@/core/model"
import { isValidForExport } from "@/core/validation"

import { defined } from "./helpers"

function baseState(): EditorState {
  return { ...createFreshState(), tableName: "t", catalog: "c", schema: "s" }
}

function namedObjectWithChildren(): EditorState {
  return fromDefinition({
    version: "1.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [
      {
        name: "obj",
        type: "Object",
        fields: [{ name: "inner", type: "String" }],
        options: { required: true },
      },
    ],
    mutation: false,
  })
}

function arrayOfObject(): EditorState {
  return fromDefinition({
    version: "1.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [
      {
        name: "items",
        type: "Array",
        items: {
          type: "Object",
          fields: [{ name: "sku", type: "String" }],
        },
      },
    ],
    mutation: false,
  })
}

describe("add / remove at any nesting level", () => {
  it("adds a top-level field", () => {
    const state = addField(baseState(), [], createField("String"))
    expect(state.fields).toHaveLength(1)
  })

  it("adds a child to an Object and a grandchild below it", () => {
    let state = addField(baseState(), [], createField("Object"))
    state = addField(state, [0], createField("Object"))
    state = addField(state, [0, 0], createField("String"))
    const [child] = defined(defined(state.fields[0]).fields)
    expect(defined(defined(child).fields)).toHaveLength(1)
  })

  it("adds a child to an Array-of-Object item", () => {
    let state = addField(baseState(), [], createField("Array"))
    // Make the array item an Object first.
    const retyped = changeArrayItemType(state, [0], "Object")
    state = addField(retyped.state, [0], createField("String"))
    const { items } = defined(state.fields[0])
    expect(defined(defined(items).fields)).toHaveLength(1)
  })

  it("removes a nested field", () => {
    let state = addField(baseState(), [], createField("Object"))
    state = addField(state, [0], createField("String"))
    state = addField(state, [0], createField("Integer"))
    state = removeField(state, [0, 0])
    const fields = defined(defined(state.fields[0]).fields)
    expect(fields).toHaveLength(1)
    expect(defined(fields[0]).type).toBe("Integer")
  })
})

describe("empty-Object validity", () => {
  it("a newly added Object with no children is invalid", () => {
    const state = addField(baseState(), [], {
      ...createField("Object"),
      name: "obj",
    })
    expect(isValidForExport(state)).toBeFalsy()
  })

  it("empty top-level fields is valid", () => {
    expect(isValidForExport(baseState())).toBeTruthy()
  })
})

describe("type-change transition matrix", () => {
  it("primitive → primitive is no-loss and preserves name + options", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [{ name: "x", type: "String", options: { required: true } }],
      mutation: false,
    })
    const result = changeFieldType(state, [0], "Integer")
    expect(result.plan.needsConfirmation).toBeFalsy()
    const field = defined(result.state.fields[0])
    expect(field.type).toBe("Integer")
    expect(field.name).toBe("x")
    expect(field.options).toStrictEqual({ required: true })
  })

  it("Object → primitive is refused without confirmation and leaves state untouched", () => {
    const state = namedObjectWithChildren()
    const dry = changeFieldType(state, [0], "String")
    expect(dry.plan.needsConfirmation).toBeTruthy()
    expect(dry.plan.lostDescription).toContain("child field")
    expect(dry.applied).toBeFalsy()
    expect(dry.state).toBe(state)
  })

  it("Object → primitive on confirm drops fields but keeps name + options", () => {
    const state = namedObjectWithChildren()
    const applied = changeFieldType(state, [0], "String", { confirm: true })
    const field = defined(applied.state.fields[0])
    expect(field.type).toBe("String")
    expect(field.name).toBe("obj")
    expect(field.options).toStrictEqual({ required: true })
    expect(field.fields).toBeUndefined()
  })

  it("Object → Object keeps children (no prompt)", () => {
    const state = namedObjectWithChildren()
    const result = changeFieldType(state, [0], "Object")
    expect(result.plan.needsConfirmation).toBeFalsy()
    expect(defined(defined(result.state.fields[0]).fields)).toHaveLength(1)
  })

  it("Object → Array is lossy and drops fields on confirm", () => {
    const state = namedObjectWithChildren()
    const dry = changeFieldType(state, [0], "Array")
    expect(dry.plan.needsConfirmation).toBeTruthy()
    const applied = changeFieldType(state, [0], "Array", { confirm: true })
    const field = defined(applied.state.fields[0])
    expect(field.type).toBe("Array")
    expect(field.fields).toBeUndefined()
    expect(field.items).toStrictEqual({ type: "String" })
  })

  it("empty Object → primitive is no-loss (no children to drop)", () => {
    const state = addField(baseState(), [], {
      ...createField("Object"),
      name: "e",
    })
    const result = changeFieldType(state, [0], "String")
    expect(result.plan.needsConfirmation).toBeFalsy()
    expect(result.applied).toBeTruthy()
    expect(defined(result.state.fields[0]).type).toBe("String")
  })

  it("Array → primitive is lossy and drops items on confirm", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [{ name: "arr", type: "Array", items: { type: "String" } }],
      mutation: false,
    })
    const dry = changeFieldType(state, [0], "Integer")
    expect(dry.plan.needsConfirmation).toBeTruthy()
    const applied = changeFieldType(state, [0], "Integer", { confirm: true })
    const field = defined(applied.state.fields[0])
    expect(field.type).toBe("Integer")
    expect(field.items).toBeUndefined()
  })
})

describe("array item type-change", () => {
  it("Array<Object> → Array<String> is refused without confirmation", () => {
    const state = arrayOfObject()
    const dry = changeArrayItemType(state, [0], "String")
    expect(dry.plan.needsConfirmation).toBeTruthy()
    expect(dry.plan.lostDescription).toContain("child field")
    expect(dry.applied).toBeFalsy()
    expect(dry.state).toBe(state)
  })

  it("Array<Object> → Array<String> drops item fields on confirm", () => {
    const state = arrayOfObject()
    const applied = changeArrayItemType(state, [0], "String", {
      confirm: true,
    })
    expect(applied.applied).toBeTruthy()
    expect(defined(applied.state.fields[0]).items).toStrictEqual({
      type: "String",
    })
  })

  it("Array<String> → Array<Integer> is no-loss", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [{ name: "a", type: "Array", items: { type: "String" } }],
      mutation: false,
    })
    const result = changeArrayItemType(state, [0], "Integer")
    expect(result.plan.needsConfirmation).toBeFalsy()
    expect(defined(result.state.fields[0]).items).toStrictEqual({
      type: "Integer",
    })
  })

  it("Array<String> → Array<Object> starts with empty object item (no prompt)", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [{ name: "a", type: "Array", items: { type: "String" } }],
      mutation: false,
    })
    const result = changeArrayItemType(state, [0], "Object")
    expect(result.plan.needsConfirmation).toBeFalsy()
    expect(defined(result.state.fields[0]).items).toStrictEqual({
      type: "Object",
      fields: [],
    })
  })
})
