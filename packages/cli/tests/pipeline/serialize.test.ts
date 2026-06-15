import { describe, expect, it } from "vitest"

import { serializeDeterministic } from "@/pipeline/serialize"

describe(serializeDeterministic, () => {
  it("sorts top-level keys lexicographically", () => {
    const input = { zebra: 1, apple: 2, mango: 3 }
    const result = serializeDeterministic(input)
    const lines = result.split("\n")

    expect(lines[1]).toBe('  "apple": 2,')
    expect(lines[2]).toBe('  "mango": 3,')
    expect(lines[3]).toBe('  "zebra": 1')
  })

  it("recursively sorts keys in nested objects", () => {
    const input = {
      outer: {
        z_key: "last",
        a_key: "first",
      },
    }
    const result = serializeDeterministic(input)

    expect(result).toBe(
      '{\n  "outer": {\n    "a_key": "first",\n    "z_key": "last"\n  }\n}\n'
    )
  })

  it("sorts keys in objects nested within arrays", () => {
    const input = {
      items: [
        { name: "b", value: 2 },
        { value: 1, name: "a" },
      ],
    }
    const result = serializeDeterministic(input)
    // Each object within the array should have keys sorted
    expect(result).toContain('"name": "b"')
    expect(result).toContain('"name": "a"')
    // "name" should come before "value" in each object
    const nameIdx = result.indexOf('"name": "a"')
    const valueIdx = result.indexOf('"value": 1')
    expect(nameIdx).toBeLessThan(valueIdx)
  })

  it("does not reorder array elements", () => {
    const input = { list: [3, 1, 2] }
    const result = serializeDeterministic(input)

    expect(result).toBe('{\n  "list": [\n    3,\n    1,\n    2\n  ]\n}\n')
  })

  it("uses 2-space indentation", () => {
    const input = { a: { b: { c: true } } }
    const result = serializeDeterministic(input)

    expect(result).toContain('  "a"')
    expect(result).toContain('    "b"')
    expect(result).toContain('      "c"')
  })

  it("uses LF line endings exclusively", () => {
    const input = { key: "value", nested: { inner: true } }
    const result = serializeDeterministic(input)

    expect(result).not.toContain("\r\n")
    expect(result).toContain("\n")
  })

  it("ends with exactly one trailing newline", () => {
    const input = { key: "value" }
    const result = serializeDeterministic(input)

    expect(result.endsWith("\n")).toBeTruthy()
    expect(result.endsWith("\n\n")).toBeFalsy()
  })

  it("handles null values", () => {
    const input = { a: null, b: "test" }
    const result = serializeDeterministic(input)

    expect(result).toBe('{\n  "a": null,\n  "b": "test"\n}\n')
  })

  it("handles deeply nested structures", () => {
    const input = {
      z: {
        y: {
          x: {
            w: "deep",
            a: "first",
          },
          b: "second",
        },
        c: "third",
      },
      a: "top",
    }
    const result = serializeDeterministic(input)
    const parsed = JSON.parse(result)

    // Verify the round-trip preserves data
    expect(parsed.a).toBe("top")
    expect(parsed.z.y.x.w).toBe("deep")

    // Verify key ordering: "a" before "z" at top level
    const aIdx = result.indexOf('"a": "top"')
    const zIdx = result.indexOf('"z"')
    expect(aIdx).toBeLessThan(zIdx)
  })

  it("produces byte-identical output on re-serialization (round-trip)", () => {
    const input = {
      version: "1.0",
      tableName: "user_events",
      catalog: "analytics",
      schema: "tracking",
      fields: [
        { name: "event_id", type: "String" },
        { name: "timestamp", type: "DateTime" },
        {
          name: "metadata",
          type: "Object",
          fields: [
            { name: "source", type: "String" },
            { name: "version", type: "Float" },
          ],
        },
      ],
    }

    const first = serializeDeterministic(input)
    const reparsed = JSON.parse(first)
    const second = serializeDeterministic(reparsed)

    expect(first).toBe(second)
  })
})
