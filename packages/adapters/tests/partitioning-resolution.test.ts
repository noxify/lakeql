import type { JsonSchema } from "@lakeql/parquet"
import { describe, expect, test } from "vitest"

import {
  enrichJsonSchemaWithTimestamp,
  injectLoadTimestamp,
  resolvePartitioningConfig,
} from "../src/write-pipeline"

describe(resolvePartitioningConfig, () => {
  test("true resolves to timestamp mode with default format", () => {
    const result = resolvePartitioningConfig(true)

    expect(result).toStrictEqual({
      mode: "timestamp",
      format: "year/month/day",
    })
  })

  test("true with custom format resolves to timestamp mode with that format", () => {
    const result = resolvePartitioningConfig(true, "year/month")

    expect(result).toStrictEqual({
      mode: "timestamp",
      format: "year/month",
    })
  })

  test("false resolves to disabled mode", () => {
    const result = resolvePartitioningConfig(false)

    expect(result).toStrictEqual({
      mode: "disabled",
      format: "year/month/day",
    })
  })

  test("false with custom format preserves format in disabled mode", () => {
    const result = resolvePartitioningConfig(false, "year")

    expect(result).toStrictEqual({
      mode: "disabled",
      format: "year",
    })
  })

  test("string field name resolves to field mode", () => {
    const result = resolvePartitioningConfig("event_date")

    expect(result).toStrictEqual({
      mode: "field",
      format: "year/month/day",
      fieldName: "event_date",
    })
  })

  test("string field name with custom format", () => {
    const result = resolvePartitioningConfig("created_at", "year/month")

    expect(result).toStrictEqual({
      mode: "field",
      format: "year/month",
      fieldName: "created_at",
    })
  })

  test("defaults to true (timestamp mode) when called with no arguments", () => {
    const result = resolvePartitioningConfig()

    expect(result).toStrictEqual({
      mode: "timestamp",
      format: "year/month/day",
    })
  })
})

describe(enrichJsonSchemaWithTimestamp, () => {
  const baseSchema: JsonSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer" },
    },
    required: ["name"],
  }

  test("adds load_timestamp property to schema", () => {
    const enriched = enrichJsonSchemaWithTimestamp(baseSchema)

    expect(enriched.properties).toHaveProperty("load_timestamp")
    expect(enriched.properties?.load_timestamp).toStrictEqual({
      type: "string",
      format: "date-time",
    })
  })

  test("preserves original schema properties", () => {
    const enriched = enrichJsonSchemaWithTimestamp(baseSchema)

    expect(enriched.properties?.name).toStrictEqual({ type: "string" })
    expect(enriched.properties?.age).toStrictEqual({ type: "integer" })
    expect(enriched.required).toStrictEqual(["name"])
  })

  test("does not mutate the original schema", () => {
    const original = structuredClone(baseSchema)
    enrichJsonSchemaWithTimestamp(baseSchema)

    expect(baseSchema).toStrictEqual(original)
  })

  test("handles schema with no existing properties", () => {
    const emptySchema: JsonSchema = { type: "object" }
    const enriched = enrichJsonSchemaWithTimestamp(emptySchema)

    expect(enriched.properties).toStrictEqual({
      load_timestamp: { type: "string", format: "date-time" },
      load_timestamp_year: { type: "integer" },
      load_timestamp_month: { type: "integer" },
    })
  })
})

describe(injectLoadTimestamp, () => {
  const timestamp = new Date("2024-06-15T10:30:00.000Z")

  test("adds load_timestamp ISO string to each record", () => {
    const records = [{ name: "Alice" }, { name: "Bob" }]
    const result = injectLoadTimestamp(records, timestamp)

    expect(result).toStrictEqual([
      {
        name: "Alice",
        load_timestamp: "2024-06-15T10:30:00.000Z",
        load_timestamp_year: 2024,
        load_timestamp_month: 6,
      },
      {
        name: "Bob",
        load_timestamp: "2024-06-15T10:30:00.000Z",
        load_timestamp_year: 2024,
        load_timestamp_month: 6,
      },
    ])
  })

  test("produces valid ISO 8601 format string", () => {
    const records = [{ id: 1 }]
    const result = injectLoadTimestamp(records, timestamp)

    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
    expect(result[0]?.load_timestamp).toMatch(isoPattern)
  })

  test("does not mutate the original records", () => {
    const records = [{ name: "Alice" }, { name: "Bob" }]
    const originalRecords = structuredClone(records)
    injectLoadTimestamp(records, timestamp)

    expect(records).toStrictEqual(originalRecords)
  })

  test("handles empty record array", () => {
    const result = injectLoadTimestamp([], timestamp)

    expect(result).toStrictEqual([])
  })

  test("uses the same timestamp value for all records", () => {
    const records = [{ a: 1 }, { b: 2 }, { c: 3 }]
    const result = injectLoadTimestamp(records, timestamp)

    const timestamps = result.map((r) => r.load_timestamp)
    expect(new Set(timestamps).size).toBe(1)
  })
})
