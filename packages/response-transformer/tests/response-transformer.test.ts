import { toJsonSchema } from "@valibot/to-json-schema"
import type { JSONSchema7 } from "@valibot/to-json-schema"
import { array, boolean, number, object, optional, string } from "valibot"
import { describe, expect, test } from "vitest"

import {
  convertTrinoResponse,
  transform,
  transformArray,
  transformObject,
} from "../src"

describe("Response Transformer", () => {
  test("simple", () => {
    const data = {
      booleanValue: true,
      numberValue: 123,
      stringValue: "abc",
    }

    const result = {
      booleanValue: true,
      numberValue: 123,
      stringValue: "abc",
    }

    const schemaDefinition = object({
      booleanValue: optional(boolean()),
      numberValue: optional(number()),
      stringValue: optional(string()),
    })

    const generated = transform({
      data,
      definition: toJsonSchema(schemaDefinition),
    })

    expect(generated).toMatchObject(result)
  })

  test("with transform fields ", () => {
    const data = {
      booleanValue: true,
      numberValue: 123,
      stringValue: "abc",
    }

    const result = {
      booleanValue: true,
      numberValue: 123,
      "string-value": "abc",
    }

    const transformFields = {
      stringValue: "string-value",
    }

    const schemaDefinition = object({
      booleanValue: optional(boolean()),
      numberValue: optional(number()),
      stringValue: optional(string()),
    })

    const generated = transform({
      data,
      definition: toJsonSchema(schemaDefinition),
      transformFields,
    })

    expect(generated).toMatchObject(result)
  })

  test("with nested fields ", () => {
    const data = {
      arrayObject: [["value1"], ["value2", "value3"]],
      arrayValue: ["value"],
      booleanValue: true,
      numberValue: 123,
      objectValue: ["value"],
      stringValue: "abc",
    }

    const result = {
      arrayObject: [
        {
          ele2: "value1",
          ele3: null,
        },
        {
          ele2: "value2",
          ele3: "value3",
        },
      ],
      arrayValue: ["value"],
      booleanValue: true,
      numberValue: 123,
      objectValue: {
        ele1: "value",
      },
      stringValue: "abc",
    }

    const schemaDefinition = object({
      arrayObject: optional(
        array(object({ ele2: optional(string()), ele3: optional(string()) }))
      ),
      arrayValue: optional(array(string())),
      booleanValue: optional(boolean()),
      numberValue: optional(number()),
      objectValue: optional(object({ ele1: optional(string()) })),
      stringValue: optional(string()),
    })

    const generated = transform({
      data,
      definition: toJsonSchema(schemaDefinition),
    })

    expect(generated).toMatchObject(result)
  })

  test("nested with transform fields ", () => {
    const data = {
      arrayObject: [["value1"], ["value2", "value3"]],
      arrayValue: ["value"],
      booleanValue: true,
      numberValue: 123,
      objectValue: ["value"],
      stringValue: "abc",
    }

    const result = {
      arrayObject: [
        {
          "ele-3": null,
          ele2: "value1",
        },
        {
          "ele-3": "value3",
          ele2: "value2",
        },
      ],
      arrayValue: ["value"],
      booleanValue: true,
      numberValue: 123,
      objectValue: {
        ele1: "value",
      },
      stringValue: "abc",
    }

    const transformFields = {
      ele3: "ele-3",
    }

    const schemaDefinition = object({
      arrayObject: optional(
        array(object({ ele2: optional(string()), ele3: optional(string()) }))
      ),
      arrayValue: optional(array(string())),
      booleanValue: optional(boolean()),
      numberValue: optional(number()),
      objectValue: optional(object({ ele1: optional(string()) })),
      stringValue: optional(string()),
    })

    const generated = transform({
      data,
      definition: toJsonSchema(schemaDefinition),
      transformFields,
    })

    expect(generated).toMatchObject(result)
  })
})

describe("trino helper", () => {
  test("convertTrinoResponse", () => {
    const keys = ["stringField", "numberField", "boolField"]
    const values = ["stringValue", 42, true]

    const generated = convertTrinoResponse({ keys, values })

    const expected = {
      boolField: true,
      numberField: 42,
      stringField: "stringValue",
    }

    expect(generated).toMatchObject(expected)
  })
})

describe("Date transformations", () => {
  test("transform with dateFields", () => {
    const data = {
      regularField: "value",
      timestamp: 1_625_097_600,
    }

    const schemaDefinition = object({
      regularField: optional(string()),
      timestamp: optional(number()),
    })

    const generated = transform({
      data,
      dateFields: ["timestamp"],
      definition: toJsonSchema(schemaDefinition),
    })

    expect(generated).toMatchObject({
      regularField: "value",
      timestamp: 1_625_097_600 * 1000,
    })
  })

  test("transform with utcDates", () => {
    const data = {
      regularField: "value",
      timestamp: 1_625_097_600,
    }

    const schemaDefinition = object({
      regularField: optional(string()),
      timestamp: optional(number()),
    })

    const generated = transform({
      data,
      dateFields: ["timestamp"],
      definition: toJsonSchema(schemaDefinition),
      utcDates: ["timestamp"],
    })

    expect(generated.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u
    )
    expect(generated.regularField).toBe("value")
  })
})

describe("Edge cases", () => {
  test("transform with unknown property", () => {
    const data = {
      knownField: "value",
      unknownField: "should be ignored",
    }

    const schemaDefinition = object({
      knownField: optional(string()),
    })

    const generated = transform({
      data,
      definition: toJsonSchema(schemaDefinition),
    })

    expect(generated).toMatchObject({
      knownField: "value",
    })
    expect(generated).not.toHaveProperty("unknownField")
  })

  test("transformObject with array data", () => {
    const data = ["value1", "value2"]

    const definition = {
      properties: {
        field1: { type: "string" },
        field2: { type: "string" },
      },
    }

    const generated = transformObject({
      // @ts-expect-error invalid input type (?)
      data,
      definition: definition as JSONSchema7,
    })

    expect(generated).toMatchObject({
      field1: "value1",
      field2: "value2",
    })
  })

  test("transformObject with null data", () => {
    const definition = {
      properties: {
        field1: { type: "string" },
        field2: { type: "string" },
      },
    }

    const generated = transformObject({
      // @ts-expect-error ignore invalid input type
      data: null,
      definition: definition as JSONSchema7,
    })

    expect(generated).toMatchObject({
      field1: null,
      field2: null,
    })
  })

  test("transformArray with non-object definition", () => {
    const data = [{ field: ["value1", "value2"] }]
    const definition = { type: "string" }

    const generated = transformArray({
      data,
      definition: definition as JSONSchema7,
    })

    expect(generated).toStrictEqual(data)
  })
})
