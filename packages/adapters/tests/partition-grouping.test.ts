import { describe, expect, test, vi } from "vitest"

// Mock crypto.randomUUID for deterministic partition paths
vi.mock("node:crypto", async () => ({
  default: {
    randomUUID: () => "test-uuid-1234",
  },
}))

import {
  groupRecordsByPartition,
  parseISODate,
  PartitionFieldError,
} from "../src/write-pipeline"

describe("parseISODate", () => {
  test("parses valid ISO date (YYYY-MM-DD)", () => {
    const result = parseISODate("2024-06-15")
    expect(result).toBeInstanceOf(Date)
    expect(result!.toISOString()).toBe("2024-06-15T00:00:00.000Z")
  })

  test("parses valid ISO datetime with Z timezone", () => {
    const result = parseISODate("2024-06-15T10:30:00Z")
    expect(result).toBeInstanceOf(Date)
    expect(result!.toISOString()).toBe("2024-06-15T10:30:00.000Z")
  })

  test("parses valid ISO datetime with timezone offset", () => {
    const result = parseISODate("2024-06-15T10:30:00+02:00")
    expect(result).toBeInstanceOf(Date)
    expect(result!.getTime()).toBe(new Date("2024-06-15T08:30:00Z").getTime())
  })

  test("parses valid ISO datetime with milliseconds", () => {
    const result = parseISODate("2024-06-15T10:30:00.123Z")
    expect(result).toBeInstanceOf(Date)
    expect(result!.toISOString()).toBe("2024-06-15T10:30:00.123Z")
  })

  test("returns null for completely invalid string", () => {
    expect(parseISODate("not-a-date")).toBeNull()
  })

  test("returns null for empty string", () => {
    expect(parseISODate("")).toBeNull()
  })

  test("returns null for non-ISO parseable string (e.g. 'June 15, 2024')", () => {
    // new Date("June 15, 2024") would succeed, but it's not ISO format
    expect(parseISODate("June 15, 2024")).toBeNull()
  })

  test("returns null for non-ISO parseable string (e.g. '06/15/2024')", () => {
    expect(parseISODate("06/15/2024")).toBeNull()
  })

  test("returns null for partial ISO format missing day", () => {
    expect(parseISODate("2024-06")).toBeNull()
  })
})

describe("groupRecordsByPartition", () => {
  test("groups records by partition path based on date field", () => {
    const records = [
      { id: 1, event_date: "2024-06-15", name: "Alice" },
      { id: 2, event_date: "2024-06-15", name: "Bob" },
      { id: 3, event_date: "2024-07-20", name: "Charlie" },
    ]

    const groups = groupRecordsByPartition(
      records,
      "event_date",
      "year/month/day"
    )

    // With mocked UUID, records from same date go to same partition
    // 2024-06-15 → year=2024/month=06/day=15/test-uuid-1234.parquet
    // 2024-07-20 → year=2024/month=07/day=20/test-uuid-1234.parquet
    expect(groups.size).toBe(2)

    const juneKey = "year=2024/month=06/day=15/test-uuid-1234.parquet"
    const julyKey = "year=2024/month=07/day=20/test-uuid-1234.parquet"

    expect(groups.get(juneKey)).toEqual([
      { id: 1, event_date: "2024-06-15", name: "Alice" },
      { id: 2, event_date: "2024-06-15", name: "Bob" },
    ])
    expect(groups.get(julyKey)).toEqual([
      { id: 3, event_date: "2024-07-20", name: "Charlie" },
    ])
  })

  test("groups records with year/month format", () => {
    const records = [
      { id: 1, created_at: "2024-06-15T10:00:00Z" },
      { id: 2, created_at: "2024-06-20T14:00:00Z" },
    ]

    const groups = groupRecordsByPartition(records, "created_at", "year/month")

    // Both records fall in year=2024/month=06
    expect(groups.size).toBe(1)
    const key = "year=2024/month=06/test-uuid-1234.parquet"
    expect(groups.get(key)).toHaveLength(2)
  })

  test("groups records with year format", () => {
    const records = [
      { id: 1, ts: "2024-01-01" },
      { id: 2, ts: "2024-12-31" },
    ]

    const groups = groupRecordsByPartition(records, "ts", "year")

    expect(groups.size).toBe(1)
    const key = "year=2024/test-uuid-1234.parquet"
    expect(groups.get(key)).toHaveLength(2)
  })

  test("throws PartitionFieldError with reason 'missing' when field does not exist", () => {
    const records = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]

    expect(() =>
      groupRecordsByPartition(records, "event_date", "year/month/day")
    ).toThrow(PartitionFieldError)

    try {
      groupRecordsByPartition(records, "event_date", "year/month/day")
    } catch (error) {
      const e = error as PartitionFieldError
      expect(e.fieldName).toBe("event_date")
      expect(e.reason).toBe("missing")
      expect(e.recordIndex).toBe(0)
      expect(e.message).toBe(
        'Partition field "event_date" not found in record at index 0'
      )
    }
  })

  test("throws PartitionFieldError with reason 'null' when field is null", () => {
    const records = [{ id: 1, event_date: null }]

    expect(() =>
      groupRecordsByPartition(records, "event_date", "year/month/day")
    ).toThrow(PartitionFieldError)

    try {
      groupRecordsByPartition(records, "event_date", "year/month/day")
    } catch (error) {
      const e = error as PartitionFieldError
      expect(e.fieldName).toBe("event_date")
      expect(e.reason).toBe("null")
      expect(e.recordIndex).toBe(0)
      expect(e.message).toBe(
        'Partition field "event_date" is null/empty in record at index 0'
      )
    }
  })

  test("throws PartitionFieldError with reason 'null' when field is empty string", () => {
    const records = [{ id: 1, event_date: "" }]

    expect(() =>
      groupRecordsByPartition(records, "event_date", "year/month/day")
    ).toThrow(PartitionFieldError)

    try {
      groupRecordsByPartition(records, "event_date", "year/month/day")
    } catch (error) {
      const e = error as PartitionFieldError
      expect(e.reason).toBe("null")
      expect(e.recordIndex).toBe(0)
    }
  })

  test("throws PartitionFieldError with reason 'invalid_date' for non-ISO date", () => {
    const records = [{ id: 1, event_date: "not-a-date" }]

    expect(() =>
      groupRecordsByPartition(records, "event_date", "year/month/day")
    ).toThrow(PartitionFieldError)

    try {
      groupRecordsByPartition(records, "event_date", "year/month/day")
    } catch (error) {
      const e = error as PartitionFieldError
      expect(e.fieldName).toBe("event_date")
      expect(e.reason).toBe("invalid_date")
      expect(e.recordIndex).toBe(0)
      expect(e.value).toBe("not-a-date")
      expect(e.message).toBe(
        'Partition field "event_date" has invalid date value "not-a-date" in record at index 0'
      )
    }
  })

  test("reports correct recordIndex for errors in later records", () => {
    const records = [
      { id: 1, event_date: "2024-06-15" },
      { id: 2, event_date: "2024-06-16" },
      { id: 3 }, // missing field at index 2
    ]

    try {
      groupRecordsByPartition(records, "event_date", "year/month/day")
    } catch (error) {
      const e = error as PartitionFieldError
      expect(e.recordIndex).toBe(2)
      expect(e.reason).toBe("missing")
    }
  })
})

describe("PartitionFieldError", () => {
  test("has correct name property", () => {
    const error = new PartitionFieldError("event_date", "missing", 0)
    expect(error.name).toBe("PartitionFieldError")
  })

  test("is an instance of Error", () => {
    const error = new PartitionFieldError("event_date", "missing", 0)
    expect(error).toBeInstanceOf(Error)
  })

  test("includes value property for invalid_date reason", () => {
    const error = new PartitionFieldError(
      "event_date",
      "invalid_date",
      5,
      "bad-value"
    )
    expect(error.value).toBe("bad-value")
    expect(error.fieldName).toBe("event_date")
    expect(error.reason).toBe("invalid_date")
    expect(error.recordIndex).toBe(5)
  })
})
