import { describe, expect, it } from "vitest"

import { parquetSerializer } from "../src/serializer/parquet"
import type { SerializerOutput } from "../src/serializer/types"

describe(parquetSerializer, () => {
  const sampleSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer" },
    },
    required: ["name", "age"],
  }

  const sampleRecords = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]

  it("returns a Serializer with a serialize method", () => {
    const serializer = parquetSerializer()
    expect(serializer).toHaveProperty("serialize")
    expect(serializer.serialize).toBeTypeOf("function")
  })

  it("serialize returns a Promise", () => {
    const serializer = parquetSerializer()
    const result = serializer.serialize(sampleRecords, sampleSchema)
    expect(result).toBeInstanceOf(Promise)
  })

  it("output has extension 'parquet'", async () => {
    const serializer = parquetSerializer()
    const output = await serializer.serialize(sampleRecords, sampleSchema)
    expect(output.extension).toBe("parquet")
  })

  it("output has contentType 'application/vnd.apache.parquet'", async () => {
    const serializer = parquetSerializer()
    const output = await serializer.serialize(sampleRecords, sampleSchema)
    expect(output.contentType).toBe("application/vnd.apache.parquet")
  })

  it("output buffer is a non-empty Uint8Array", async () => {
    const serializer = parquetSerializer()
    const output = await serializer.serialize(sampleRecords, sampleSchema)
    expect(output.buffer).toBeInstanceOf(Uint8Array)
    expect(output.buffer.byteLength).toBeGreaterThan(0)
  })

  it("output shape matches SerializerOutput interface", async () => {
    const serializer = parquetSerializer()
    const output: SerializerOutput = await serializer.serialize(
      sampleRecords,
      sampleSchema
    )

    expect(output).toHaveProperty("buffer")
    expect(output).toHaveProperty("extension")
    expect(output).toHaveProperty("contentType")
    expect(Object.keys(output).toSorted()).toStrictEqual(
      ["buffer", "contentType", "extension"].toSorted()
    )
  })

  it("serializes single record", async () => {
    const serializer = parquetSerializer()
    const output = await serializer.serialize(
      [{ name: "Charlie", age: 42 }],
      sampleSchema
    )
    expect(output.buffer).toBeInstanceOf(Uint8Array)
    expect(output.buffer.byteLength).toBeGreaterThan(0)
  })

  it("serializes records with various field types", async () => {
    const schema = {
      type: "object",
      properties: {
        id: { type: "integer" },
        label: { type: "string" },
        score: { type: "number" },
        active: { type: "boolean" },
      },
      required: ["id", "label", "score", "active"],
    }

    const records = [
      { id: 1, label: "first", score: 9.5, active: true },
      { id: 2, label: "second", score: 7.2, active: false },
    ]

    const serializer = parquetSerializer()
    const output = await serializer.serialize(records, schema)
    expect(output.buffer).toBeInstanceOf(Uint8Array)
    expect(output.buffer.byteLength).toBeGreaterThan(0)
    expect(output.extension).toBe("parquet")
  })

  it("accepts a rowGroupSize option and produces valid output", async () => {
    const serializer = parquetSerializer({ rowGroupSize: 1 })
    const output = await serializer.serialize(sampleRecords, sampleSchema)
    expect(output.buffer).toBeInstanceOf(Uint8Array)
    expect(output.buffer.byteLength).toBeGreaterThan(0)
    expect(output.extension).toBe("parquet")
  })

  it("propagates an invalid rowGroupSize error from the writer", async () => {
    const serializer = parquetSerializer({ rowGroupSize: 0 })
    await expect(
      serializer.serialize(sampleRecords, sampleSchema)
    ).rejects.toThrow("rowGroupSize must be a positive integer")
  })
})
