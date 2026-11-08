// oxlint-disable vitest/max-expects

import { parquetReadObjects } from "hyparquet"
import { describe, expect, it } from "vitest"

import type { JsonSchema } from "../src/converter"
import { jsonSchemaToColumnDefs, writeParquetStreaming } from "../src/streaming"

/** Wraps a Uint8Array as an AsyncBuffer for the hyparquet reader. */
function asyncBufferFromUint8Array(data: Uint8Array) {
  return {
    byteLength: data.byteLength,
    slice(start: number, end?: number): ArrayBuffer {
      return data.buffer.slice(
        data.byteOffset + start,
        end === undefined
          ? data.byteOffset + data.byteLength
          : data.byteOffset + end
      ) as ArrayBuffer
    },
  }
}

async function readBack(data: Uint8Array): Promise<Record<string, unknown>[]> {
  const file = asyncBufferFromUint8Array(data)
  return parquetReadObjects({ file })
}

const simpleSchema: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: ["string", "null"] },
    score: { type: "number" },
    active: { type: "boolean" },
    created: { type: "string", format: "date-time" },
  },
}

const simpleRecords: Record<string, unknown>[] = [
  {
    id: 1,
    name: "alice",
    score: 1.5,
    active: true,
    created: "2024-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: null,
    score: 2.5,
    active: false,
    created: "2024-02-01T00:00:00Z",
  },
]

describe(writeParquetStreaming, () => {
  describe("round-trip", () => {
    it("preserves simple typed values and nulls", async () => {
      const buffer = writeParquetStreaming({
        records: simpleRecords,
        jsonSchema: simpleSchema,
      })
      const rows = await readBack(buffer)

      expect(rows).toHaveLength(2)
      expect(Number(rows[0]?.id)).toBe(1)
      expect(rows[0]?.name).toBe("alice")
      expect(rows[0]?.score).toBe(1.5)
      expect(rows[0]?.active).toBeTruthy()
      expect(rows[1]?.name).toBeNull()
    })

    it("preserves nested object fields", async () => {
      const jsonSchema: JsonSchema = {
        type: "object",
        properties: {
          id: { type: "integer" },
          meta: {
            type: "object",
            properties: {
              source: { type: "string" },
              weight: { type: "integer" },
            },
          },
        },
      }
      const records = [{ id: 1, meta: { source: "web", weight: 5 } }]

      const rows = await readBack(
        writeParquetStreaming({ records, jsonSchema })
      )

      expect(rows).toHaveLength(1)
      const meta = rows[0]?.meta as { source: string; weight: bigint }
      expect(meta.source).toBe("web")
      expect(Number(meta.weight)).toBe(5)
    })

    it("preserves array fields", async () => {
      const jsonSchema: JsonSchema = {
        type: "object",
        properties: {
          id: { type: "integer" },
          tags: { type: "array", items: { type: "string" } },
        },
      }
      const records = [
        { id: 1, tags: ["x", "y"] },
        { id: 2, tags: [] },
      ]

      const rows = await readBack(
        writeParquetStreaming({ records, jsonSchema })
      )

      expect(rows).toHaveLength(2)
      expect(rows[0]?.tags).toStrictEqual(["x", "y"])
      expect(rows[1]?.tags).toStrictEqual([])
    })
  })

  describe("rowGroupSize", () => {
    it.each([1, 2, 10_000, 100])(
      "produces valid output with the full row count for rowGroupSize=%i",
      async (rowGroupSize) => {
        const buffer = writeParquetStreaming({
          records: simpleRecords,
          jsonSchema: simpleSchema,
          rowGroupSize,
        })
        const rows = await readBack(buffer)
        expect(rows).toHaveLength(simpleRecords.length)
      }
    )

    it("defaults to a valid row-group size when omitted", async () => {
      const rows = await readBack(
        writeParquetStreaming({
          records: simpleRecords,
          jsonSchema: simpleSchema,
        })
      )
      expect(rows).toHaveLength(2)
    })

    it.each([0, -1, 1.5, Number.NaN])(
      "throws for invalid rowGroupSize=%s",
      (rowGroupSize) => {
        expect(() =>
          writeParquetStreaming({
            records: simpleRecords,
            jsonSchema: simpleSchema,
            rowGroupSize,
          })
        ).toThrow("rowGroupSize must be a positive integer")
      }
    )
  })
})

describe(jsonSchemaToColumnDefs, () => {
  it("emits one column per top-level property in declaration order", () => {
    const defs = jsonSchemaToColumnDefs(simpleSchema)
    expect(defs.map((d) => d.name)).toStrictEqual([
      "id",
      "name",
      "score",
      "active",
      "created",
    ])
  })

  it("returns an empty list for a schema without properties", () => {
    expect(jsonSchemaToColumnDefs({ type: "object" })).toStrictEqual([])
  })
})
