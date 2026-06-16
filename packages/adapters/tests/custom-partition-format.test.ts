import { describe, expect, test, vi } from "vitest"

// Mock crypto.randomUUID for deterministic partition paths
vi.mock("node:crypto", async () => ({
  default: {
    randomUUID: () => "test-uuid-1234",
  },
}))

import {
  parsePartitioningFormat,
  generateCustomPartitionPath,
  groupRecordsByCustomPartition,
  resolvePartitioningConfig,
  PartitionFieldError,
} from "../src/write-pipeline"

describe("parsePartitioningFormat", () => {
  test("parses composite format: customer_id/event_date:year/event_date:month", () => {
    const segments = parsePartitioningFormat(
      "customer_id/event_date:year/event_date:month"
    )
    expect(segments).toHaveLength(3)
    expect(segments[0]).toEqual({ fieldName: "customer_id" })
    expect(segments[1]).toEqual({ fieldName: "event_date", component: "year" })
    expect(segments[2]).toEqual({ fieldName: "event_date", component: "month" })
  })

  test("parses date-only format: event_date:year/event_date:month/event_date:day", () => {
    const segments = parsePartitioningFormat(
      "event_date:year/event_date:month/event_date:day"
    )
    expect(segments).toHaveLength(3)
    expect(segments[0]).toEqual({ fieldName: "event_date", component: "year" })
    expect(segments[1]).toEqual({ fieldName: "event_date", component: "month" })
    expect(segments[2]).toEqual({ fieldName: "event_date", component: "day" })
  })

  test("parses single plain field: region", () => {
    const segments = parsePartitioningFormat("region")
    expect(segments).toHaveLength(1)
    expect(segments[0]).toEqual({ fieldName: "region" })
  })

  test("parses format with hour/minute/second components", () => {
    const segments = parsePartitioningFormat(
      "ts:year/ts:month/ts:day/ts:hour/ts:minute/ts:second"
    )
    expect(segments).toHaveLength(6)
    expect(segments[3]).toEqual({ fieldName: "ts", component: "hour" })
    expect(segments[4]).toEqual({ fieldName: "ts", component: "minute" })
    expect(segments[5]).toEqual({ fieldName: "ts", component: "second" })
  })

  test("parses mixed plain and date segments", () => {
    const segments = parsePartitioningFormat("region/event_date:year")
    expect(segments).toHaveLength(2)
    expect(segments[0]).toEqual({ fieldName: "region" })
    expect(segments[1]).toEqual({ fieldName: "event_date", component: "year" })
  })
})

describe("generateCustomPartitionPath", () => {
  test("extracts string field value correctly", () => {
    const segments = parsePartitioningFormat("customer_id")
    const path = generateCustomPartitionPath(
      { customer_id: "acme-corp", value: 100 },
      segments
    )
    expect(path).toBe("customer_id=acme-corp/test-uuid-1234.parquet")
  })

  test("extracts integer field value and stringifies correctly", () => {
    const segments = parsePartitioningFormat("customer_id")
    const path = generateCustomPartitionPath(
      { customer_id: 42, name: "Alice" },
      segments
    )
    expect(path).toBe("customer_id=42/test-uuid-1234.parquet")
  })

  test("extracts date component year from ISO date", () => {
    const segments = parsePartitioningFormat("event_date:year")
    const path = generateCustomPartitionPath(
      { event_date: "2024-06-15T10:30:00Z" },
      segments
    )
    expect(path).toBe("year=2024/test-uuid-1234.parquet")
  })

  test("extracts date component month, zero-padded", () => {
    const segments = parsePartitioningFormat("event_date:month")
    const path = generateCustomPartitionPath(
      { event_date: "2024-06-15" },
      segments
    )
    expect(path).toBe("month=06/test-uuid-1234.parquet")
  })

  test("extracts date component day, zero-padded", () => {
    const segments = parsePartitioningFormat("event_date:day")
    const path = generateCustomPartitionPath(
      { event_date: "2024-06-05" },
      segments
    )
    expect(path).toBe("day=05/test-uuid-1234.parquet")
  })

  test("extracts hour, minute, second components", () => {
    const segments = parsePartitioningFormat("ts:hour/ts:minute/ts:second")
    const path = generateCustomPartitionPath(
      { ts: "2024-06-15T08:03:07Z" },
      segments
    )
    expect(path).toBe("hour=08/minute=03/second=07/test-uuid-1234.parquet")
  })

  test("generates composite path with multiple segments", () => {
    const segments = parsePartitioningFormat(
      "customer_id/event_date:year/event_date:month"
    )
    const path = generateCustomPartitionPath(
      { customer_id: 42, event_date: "2024-06-15" },
      segments
    )
    expect(path).toBe(
      "customer_id=42/year=2024/month=06/test-uuid-1234.parquet"
    )
  })

  test("throws PartitionFieldError when field is missing", () => {
    const segments = parsePartitioningFormat("customer_id")
    expect(() =>
      generateCustomPartitionPath({ name: "Alice" }, segments, 3)
    ).toThrow(PartitionFieldError)

    try {
      generateCustomPartitionPath({ name: "Alice" }, segments, 3)
    } catch (error) {
      const e = error as PartitionFieldError
      expect(e.fieldName).toBe("customer_id")
      expect(e.reason).toBe("missing")
      expect(e.recordIndex).toBe(3)
    }
  })

  test("throws PartitionFieldError when field is null", () => {
    const segments = parsePartitioningFormat("customer_id")
    expect(() =>
      generateCustomPartitionPath({ customer_id: null }, segments, 0)
    ).toThrow(PartitionFieldError)

    try {
      generateCustomPartitionPath({ customer_id: null }, segments, 0)
    } catch (error) {
      const e = error as PartitionFieldError
      expect(e.fieldName).toBe("customer_id")
      expect(e.reason).toBe("null")
    }
  })

  test("throws PartitionFieldError with invalid_date for date segment with bad value", () => {
    const segments = parsePartitioningFormat("event_date:year")
    expect(() =>
      generateCustomPartitionPath({ event_date: "not-a-date" }, segments, 1)
    ).toThrow(PartitionFieldError)

    try {
      generateCustomPartitionPath({ event_date: "not-a-date" }, segments, 1)
    } catch (error) {
      const e = error as PartitionFieldError
      expect(e.fieldName).toBe("event_date")
      expect(e.reason).toBe("invalid_date")
      expect(e.value).toBe("not-a-date")
      expect(e.recordIndex).toBe(1)
    }
  })
})

describe("groupRecordsByCustomPartition", () => {
  test("groups records correctly by composite key", () => {
    const segments = parsePartitioningFormat(
      "customer_id/event_date:year/event_date:month"
    )
    const records = [
      { customer_id: 42, event_date: "2024-06-15", value: 100 },
      { customer_id: 42, event_date: "2024-06-20", value: 200 },
      { customer_id: 99, event_date: "2024-06-15", value: 300 },
    ]

    const groups = groupRecordsByCustomPartition(records, segments)

    // customer_id=42 + year=2024 + month=06 → same group
    // customer_id=99 + year=2024 + month=06 → different group
    expect(groups.size).toBe(2)

    const key42 = "customer_id=42/year=2024/month=06/test-uuid-1234.parquet"
    const key99 = "customer_id=99/year=2024/month=06/test-uuid-1234.parquet"

    expect(groups.get(key42)).toEqual([
      { customer_id: 42, event_date: "2024-06-15", value: 100 },
      { customer_id: 42, event_date: "2024-06-20", value: 200 },
    ])
    expect(groups.get(key99)).toEqual([
      { customer_id: 99, event_date: "2024-06-15", value: 300 },
    ])
  })

  test("multiple groups produce multiple entries", () => {
    const segments = parsePartitioningFormat("region/event_date:year")
    const records = [
      { region: "us-east", event_date: "2024-06-15" },
      { region: "us-west", event_date: "2024-06-15" },
      { region: "us-east", event_date: "2023-01-01" },
    ]

    const groups = groupRecordsByCustomPartition(records, segments)

    // 3 unique keys: us-east/2024, us-west/2024, us-east/2023
    expect(groups.size).toBe(3)
  })

  test("throws PartitionFieldError for missing fields", () => {
    const segments = parsePartitioningFormat("customer_id")
    const records = [
      { customer_id: 1 },
      { name: "no customer_id" }, // missing
    ]

    expect(() => groupRecordsByCustomPartition(records, segments)).toThrow(
      PartitionFieldError
    )

    try {
      groupRecordsByCustomPartition(records, segments)
    } catch (error) {
      const e = error as PartitionFieldError
      expect(e.fieldName).toBe("customer_id")
      expect(e.reason).toBe("missing")
      expect(e.recordIndex).toBe(1)
    }
  })
})

describe("resolvePartitioningConfig — custom mode", () => {
  test("resolves format with / as custom mode", () => {
    const result = resolvePartitioningConfig("customer_id/event_date:year")
    expect(result.mode).toBe("custom")
    expect(result.formatString).toBe("customer_id/event_date:year")
  })

  test("resolves format with : as custom mode", () => {
    const result = resolvePartitioningConfig("event_date:year")
    expect(result.mode).toBe("custom")
    expect(result.formatString).toBe("event_date:year")
  })

  test("resolves plain field name as field mode (no / or :)", () => {
    const result = resolvePartitioningConfig("event_date")
    expect(result.mode).toBe("field")
    expect(result.fieldName).toBe("event_date")
    expect(result.formatString).toBeUndefined()
  })

  test("resolves boolean true as timestamp mode", () => {
    const result = resolvePartitioningConfig(true)
    expect(result.mode).toBe("timestamp")
  })

  test("resolves boolean false as disabled mode", () => {
    const result = resolvePartitioningConfig(false)
    expect(result.mode).toBe("disabled")
  })
})
