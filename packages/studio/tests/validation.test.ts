import { describe, expect, it } from "vitest"

import { fromDefinition } from "@/core/mapping"
import type { EditorState } from "@/core/model"
import { createFreshState } from "@/core/model"
import { evaluate, isValidForExport } from "@/core/validation"

import { defined } from "./helpers"

function goodState(): EditorState {
  return fromDefinition({
    version: "1.0",
    tableName: "events",
    catalog: "main",
    schema: "public",
    fields: [
      { name: "id", type: "String", options: { required: true } },
      {
        name: "profile",
        type: "Object",
        fields: [{ name: "city", type: "String" }],
      },
    ],
    mutation: { loadStrategy: "append", basePath: "/data" },
  })
}

describe("valid-for-export gate", () => {
  it("accepts a good definition", () => {
    const result = evaluate(goodState())
    expect(result.validForExport).toBeTruthy()
    expect(result.schemaIssues).toStrictEqual([])
    expect(result.duplicates).toStrictEqual([])
    expect(result.badRegex).toStrictEqual([])
  })

  it("accepts an empty top-level fields array", () => {
    const state: EditorState = {
      ...createFreshState(),
      tableName: "t",
      catalog: "c",
      schema: "s",
    }
    expect(isValidForExport(state)).toBeTruthy()
  })

  it("rejects a schema-invalid metadata field and keys the issue to the path", () => {
    const state: EditorState = {
      ...createFreshState(),
      tableName: "1bad", // leading digit violates metadataFieldPattern
      catalog: "c",
      schema: "s",
    }
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(
      result.schemaIssues.some((issue) => issue.path[0] === "tableName")
    ).toBeTruthy()
  })

  it("rejects an empty Object (schema .min(1)) and keys it to the field id", () => {
    const state = goodState()
    const objectField = defined(state.fields[1]) // "profile"
    objectField.fields = []
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(
      result.schemaIssues.some((issue) => issue.fieldId === objectField.id)
    ).toBeTruthy()
  })

  it("rejects duplicate field names with the duplicate's field id", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        { name: "dup", type: "String" },
        { name: "dup", type: "Integer" },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(result.duplicates).toHaveLength(1)
    expect(defined(result.duplicates[0]).name).toBe("dup")
    // The duplicate is the second "dup".
    expect(defined(result.duplicates[0]).fieldId).toBe(
      defined(state.fields[1]).id
    )
  })

  it("rejects duplicate field names nested inside an Object", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "obj",
          type: "Object",
          fields: [
            { name: "a", type: "String" },
            { name: "a", type: "Integer" },
          ],
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const duplicate = defined(result.duplicates[0])
    expect(duplicate.name).toBe("a")
    expect(duplicate.path).toStrictEqual(["obj"])
    const innerFields = defined(defined(state.fields[0]).fields)
    expect(duplicate.fieldId).toBe(defined(innerFields[1]).id)
  })

  it("rejects an unconstructible regex pattern with the field id", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "code",
          type: "String",
          options: { validations: [{ type: "regex", pattern: "([" }] },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(result.badRegex).toHaveLength(1)
    const bad = defined(result.badRegex[0])
    expect(bad.pattern).toBe("([")
    expect(bad.fieldId).toBe(defined(state.fields[0]).id)
  })

  it("accepts a constructible regex pattern", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "code",
          type: "String",
          options: { validations: [{ type: "regex", pattern: "^[A-Z]{3}$" }] },
        },
      ],
      mutation: false,
    })
    expect(isValidForExport(state)).toBeTruthy()
  })

  it("rejects a non-finite min/max bound with the field id", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "score",
          type: "Integer",
          options: { validations: [{ type: "min", value: Number.NaN }] },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(result.badNumber).toHaveLength(1)
    const bad = defined(result.badNumber[0])
    expect(bad.kind).toBe("min")
    expect(bad.fieldId).toBe(defined(state.fields[0]).id)
  })

  it("rejects an infinite max bound", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "score",
          type: "Float",
          options: {
            validations: [{ type: "max", value: Number.POSITIVE_INFINITY }],
          },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(defined(result.badNumber[0]).kind).toBe("max")
  })

  it("accepts a finite min/max bound", () => {
    const state = fromDefinition({
      version: "1.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "score",
          type: "Integer",
          options: { validations: [{ type: "min", value: 0 }] },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeTruthy()
    expect(result.badNumber).toStrictEqual([])
  })

  it("detects a non-finite bound nested inside an Array-of-Object item", () => {
    const state = fromDefinition({
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
            fields: [
              {
                name: "qty",
                type: "Integer",
                options: { validations: [{ type: "min", value: Number.NaN }] },
              },
            ],
          },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const itemFields = defined(defined(state.fields[0]).items).fields
    expect(defined(result.badNumber[0]).fieldId).toBe(
      defined(defined(itemFields)[0]).id
    )
  })

  it("detects a bad regex nested inside an Array-of-Object item", () => {
    const state = fromDefinition({
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
            fields: [
              {
                name: "ref",
                type: "String",
                options: { validations: [{ type: "regex", pattern: "(" }] },
              },
            ],
          },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const itemFields = defined(defined(state.fields[0]).items).fields
    expect(defined(result.badRegex[0]).fieldId).toBe(
      defined(defined(itemFields)[0]).id
    )
  })
})
