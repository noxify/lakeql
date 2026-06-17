import { describe, expect, test } from "vitest"

import { formatFieldTree } from "../../src/commands/create-endpoint"
import type { FieldDefinition } from "../../src/pipeline/schema"

describe(formatFieldTree, () => {
  test("formats primitive fields with correct indentation", () => {
    const fields: FieldDefinition[] = [
      { name: "event_id", type: "String" },
      { name: "timestamp", type: "DateTime" },
      { name: "user_count", type: "Integer" },
    ]

    const result = formatFieldTree(fields)
    expect(result).toBe(
      [
        "  event_id: String",
        "  timestamp: DateTime",
        "  user_count: Integer",
      ].join("\n")
    )
  })

  test("formats Object fields with nested children", () => {
    const fields: FieldDefinition[] = [
      {
        name: "metadata",
        type: "Object",
        fields: [
          { name: "source", type: "String" },
          { name: "version", type: "Float" },
        ],
      },
    ]

    const result = formatFieldTree(fields)
    expect(result).toBe(
      ["  metadata: Object", "    source: String", "    version: Float"].join(
        "\n"
      )
    )
  })

  test("formats Array fields with primitive items", () => {
    const fields: FieldDefinition[] = [
      { name: "tags", type: "Array", items: { type: "String" } },
    ]

    const result = formatFieldTree(fields)
    expect(result).toBe("  tags: Array<String>")
  })

  test("formats Array fields with Object items", () => {
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

    const result = formatFieldTree(fields)
    expect(result).toBe(
      [
        "  dimensions: Array<Object>",
        "    key: String",
        "    value: String",
      ].join("\n")
    )
  })

  test("formats a complete mixed definition", () => {
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
      { name: "tags", type: "Array", items: { type: "String" } },
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

    const result = formatFieldTree(fields)
    expect(result).toBe(
      [
        "  event_id: String",
        "  timestamp: DateTime",
        "  user_count: Integer",
        "  metadata: Object",
        "    source: String",
        "    version: Float",
        "  tags: Array<String>",
        "  dimensions: Array<Object>",
        "    key: String",
        "    value: String",
      ].join("\n")
    )
  })

  test("formats deeply nested structures", () => {
    const fields: FieldDefinition[] = [
      {
        name: "level1",
        type: "Object",
        fields: [
          {
            name: "level2",
            type: "Object",
            fields: [{ name: "level3", type: "String" }],
          },
        ],
      },
    ]

    const result = formatFieldTree(fields)
    expect(result).toBe(
      ["  level1: Object", "    level2: Object", "      level3: String"].join(
        "\n"
      )
    )
  })

  test("handles empty fields array", () => {
    const result = formatFieldTree([])
    expect(result).toBe("")
  })
})
