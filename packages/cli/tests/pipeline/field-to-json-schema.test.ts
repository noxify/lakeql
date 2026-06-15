// oxlint-disable vitest/max-expects
// oxlint-disable typescript/no-non-null-assertion
import { generateJsonSchemaFromFields } from "@lakeql/schema-generator/json-schema"
import { describe, expect, it } from "vitest"

import type { FieldDefinition } from "@/pipeline/schema"

describe(generateJsonSchemaFromFields, () => {
  it("produces a root object with $schema, type, properties, and additionalProperties", () => {
    const result = generateJsonSchemaFromFields([])

    expect(result.$schema).toBe("https://json-schema.org/draft-07/schema#")
    expect(result.type).toBe("object")
    expect(result.properties).toStrictEqual({})
    expect(result.additionalProperties).toBeFalsy()
  })

  it("maps String fields to {type: 'string'}", () => {
    const fields: FieldDefinition[] = [{ name: "name", type: "String" }]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.name).toStrictEqual({ type: "string" })
  })

  it("maps Integer fields to {type: 'integer'}", () => {
    const fields: FieldDefinition[] = [{ name: "count", type: "Integer" }]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.count).toStrictEqual({ type: "integer" })
  })

  it("maps Float fields to {type: 'number'}", () => {
    const fields: FieldDefinition[] = [{ name: "price", type: "Float" }]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.price).toStrictEqual({ type: "number" })
  })

  it("maps Boolean fields to {type: 'boolean'}", () => {
    const fields: FieldDefinition[] = [{ name: "active", type: "Boolean" }]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.active).toStrictEqual({ type: "boolean" })
  })

  it("maps Date fields to {type: 'string', format: 'date'}", () => {
    const fields: FieldDefinition[] = [{ name: "birth_date", type: "Date" }]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.birth_date).toStrictEqual({
      type: "string",
      format: "date",
    })
  })

  it("maps DateTime fields to {type: 'string', format: 'date-time'}", () => {
    const fields: FieldDefinition[] = [{ name: "created_at", type: "DateTime" }]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.created_at).toStrictEqual({
      type: "string",
      format: "date-time",
    })
  })

  it("maps Object fields to nested object schema with additionalProperties: false", () => {
    const fields: FieldDefinition[] = [
      {
        name: "address",
        type: "Object",
        fields: [
          { name: "street", type: "String" },
          { name: "zip", type: "Integer" },
        ],
      },
    ]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.address).toStrictEqual({
      type: "object",
      properties: {
        street: { type: "string" },
        zip: { type: "integer" },
      },
      additionalProperties: false,
    })
  })

  it("maps Array fields with primitive element type", () => {
    const fields: FieldDefinition[] = [
      {
        name: "tags",
        type: "Array",
        items: { type: "String" },
      },
    ]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.tags).toStrictEqual({
      type: "array",
      items: { type: "string" },
    })
  })

  it("maps Array fields with Object element type", () => {
    const fields: FieldDefinition[] = [
      {
        name: "dimensions",
        type: "Array",
        items: {
          type: "Object",
          fields: [
            { name: "key", type: "String" },
            { name: "value", type: "String" },
          ],
        },
      },
    ]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.dimensions).toStrictEqual({
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
        additionalProperties: false,
      },
    })
  })

  it("handles deeply nested Object fields recursively", () => {
    const fields: FieldDefinition[] = [
      {
        name: "level1",
        type: "Object",
        fields: [
          {
            name: "level2",
            type: "Object",
            fields: [{ name: "value", type: "Integer" }],
          },
        ],
      },
    ]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.level1).toStrictEqual({
      type: "object",
      properties: {
        level2: {
          type: "object",
          properties: {
            value: { type: "integer" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    })
  })

  it("handles multiple fields of different types at root level", () => {
    const fields: FieldDefinition[] = [
      { name: "event_id", type: "String" },
      { name: "timestamp", type: "DateTime" },
      { name: "user_count", type: "Integer" },
      {
        name: "metadata",
        type: "Object",
        fields: [
          { name: "source", type: "String" },
          { name: "version", type: "Float" },
        ],
      },
      {
        name: "tags",
        type: "Array",
        items: { type: "String" },
      },
      {
        name: "dimensions",
        type: "Array",
        items: {
          type: "Object",
          fields: [
            { name: "key", type: "String" },
            { name: "value", type: "String" },
          ],
        },
      },
    ]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.$schema).toBe("https://json-schema.org/draft-07/schema#")
    expect(result.type).toBe("object")
    expect(result.additionalProperties).toBeFalsy()
    expect(Object.keys(result.properties!)).toHaveLength(6)
    expect(result.properties?.event_id).toStrictEqual({ type: "string" })
    expect(result.properties?.timestamp).toStrictEqual({
      type: "string",
      format: "date-time",
    })
    expect(result.properties?.user_count).toStrictEqual({ type: "integer" })
    expect(result.properties?.metadata).toStrictEqual({
      type: "object",
      properties: {
        source: { type: "string" },
        version: { type: "number" },
      },
      additionalProperties: false,
    })
    expect(result.properties?.tags).toStrictEqual({
      type: "array",
      items: { type: "string" },
    })
    expect(result.properties?.dimensions).toStrictEqual({
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
        additionalProperties: false,
      },
    })
  })

  it("handles Array fields with Date element type", () => {
    const fields: FieldDefinition[] = [
      {
        name: "dates",
        type: "Array",
        items: { type: "Date" },
      },
    ]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.dates).toStrictEqual({
      type: "array",
      items: { type: "string", format: "date" },
    })
  })

  it("handles Array fields with DateTime element type", () => {
    const fields: FieldDefinition[] = [
      {
        name: "timestamps",
        type: "Array",
        items: { type: "DateTime" },
      },
    ]
    const result = generateJsonSchemaFromFields(fields)

    expect(result.properties?.timestamps).toStrictEqual({
      type: "array",
      items: { type: "string", format: "date-time" },
    })
  })
})
