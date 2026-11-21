import type { JsonSchema } from "@lakeql/parquet"
import { describe, expect, it } from "vitest"

import {
  enrichJsonSchemaWithAutoFill,
  injectAutoFillValues,
  resolvePartitioningConfig,
} from "../src/write-pipeline"

describe(resolvePartitioningConfig, () => {
  it("false resolves to disabled mode", () => {
    expect(resolvePartitioningConfig(false)).toStrictEqual({
      mode: "disabled",
    })
  })

  it("a bare field name resolves to custom mode", () => {
    expect(resolvePartitioningConfig("event_date")).toStrictEqual({
      mode: "custom",
      formatString: "event_date",
    })
  })

  it("string with / or : resolves to custom mode", () => {
    expect(
      resolvePartitioningConfig("event_date:year/event_date:month")
    ).toStrictEqual({
      mode: "custom",
      formatString: "event_date:year/event_date:month",
    })
  })

  it("defaults to disabled mode when called with no arguments (C8)", () => {
    expect(resolvePartitioningConfig()).toStrictEqual({ mode: "disabled" })
  })

  it("never returns a timestamp mode for any input", () => {
    expect(resolvePartitioningConfig(false).mode).not.toBe("timestamp")
    expect(resolvePartitioningConfig("event_date").mode).not.toBe("timestamp")
    expect(resolvePartitioningConfig("a:year/b").mode).not.toBe("timestamp")
  })
})

describe(enrichJsonSchemaWithAutoFill, () => {
  const baseSchema: JsonSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer" },
    },
    required: ["name"],
  }

  const autoFill = [{ name: "ingested_at", kind: "write_timestamp" as const }]

  it("adds the declared field plus companions to the schema", () => {
    const enriched = enrichJsonSchemaWithAutoFill(baseSchema, autoFill)

    expect(enriched.properties?.ingested_at).toStrictEqual({
      type: "string",
      format: "date-time",
    })
    expect(enriched.properties?.ingested_at_year).toStrictEqual({
      type: "integer",
    })
    expect(enriched.properties?.ingested_at_month).toStrictEqual({
      type: "integer",
    })
  })

  it("uses the declared field name, not a hard-coded load_timestamp", () => {
    const enriched = enrichJsonSchemaWithAutoFill(baseSchema, autoFill)

    expect(enriched.properties).not.toHaveProperty("load_timestamp")
  })

  it("preserves original schema properties", () => {
    const enriched = enrichJsonSchemaWithAutoFill(baseSchema, autoFill)

    expect(enriched.properties?.name).toStrictEqual({ type: "string" })
    expect(enriched.properties?.age).toStrictEqual({ type: "integer" })
    expect(enriched.required).toStrictEqual(["name"])
  })

  it("does not mutate the original schema", () => {
    const original = structuredClone(baseSchema)
    enrichJsonSchemaWithAutoFill(baseSchema, autoFill)

    expect(baseSchema).toStrictEqual(original)
  })

  it("adds columns for every auto-fill field", () => {
    const enriched = enrichJsonSchemaWithAutoFill(baseSchema, [
      { name: "created_at", kind: "write_timestamp" },
      { name: "updated_at", kind: "write_timestamp" },
    ])

    for (const name of [
      "created_at",
      "created_at_year",
      "created_at_month",
      "updated_at",
      "updated_at_year",
      "updated_at_month",
    ]) {
      expect(enriched.properties).toHaveProperty(name)
    }
  })
})

describe(injectAutoFillValues, () => {
  const timestamp = new Date("2024-06-15T10:30:00.000Z")
  const autoFill = [{ name: "ingested_at", kind: "write_timestamp" as const }]

  it("adds the field and its companions to each record", () => {
    const records = [{ name: "Alice" }, { name: "Bob" }]
    const result = injectAutoFillValues(records, autoFill, timestamp)

    expect(result).toStrictEqual([
      {
        name: "Alice",
        ingested_at: "2024-06-15T10:30:00.000Z",
        ingested_at_year: 2024,
        ingested_at_month: 6,
      },
      {
        name: "Bob",
        ingested_at: "2024-06-15T10:30:00.000Z",
        ingested_at_year: 2024,
        ingested_at_month: 6,
      },
    ])
  })

  it("produces a valid ISO 8601 format string", () => {
    const result = injectAutoFillValues([{ id: 1 }], autoFill, timestamp)

    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
    expect(result[0]?.ingested_at).toMatch(isoPattern)
  })

  it("does not mutate the original records", () => {
    const records = [{ name: "Alice" }, { name: "Bob" }]
    const originalRecords = structuredClone(records)
    injectAutoFillValues(records, autoFill, timestamp)

    expect(records).toStrictEqual(originalRecords)
  })

  it("handles an empty record array", () => {
    const result = injectAutoFillValues([], autoFill, timestamp)

    expect(result).toStrictEqual([])
  })

  it("shares one timestamp value across all records and all fields (C14)", () => {
    const records = [{ a: 1 }, { b: 2 }, { c: 3 }]
    const result = injectAutoFillValues(
      records,
      [
        { name: "created_at", kind: "write_timestamp" },
        { name: "updated_at", kind: "write_timestamp" },
      ],
      timestamp
    )

    const values = result.flatMap((r) => [r.created_at, r.updated_at])
    expect(new Set(values).size).toBe(1)
  })
})
