import { describe, expect, vi, it } from "vitest"

// oxlint-disable vitest/prefer-import-in-mock -- vi.mock factories use inline definitions per project convention

// Mock crypto.randomUUID for deterministic partition paths
vi.mock("node:crypto", async () => ({
  default: {
    randomUUID: () => "test-uuid-1234",
  },
}))

// oxlint-disable-next-line import/first -- vi.mock must precede imports per vitest design
import { parseISODate, PartitionFieldError } from "../src/write-pipeline"

describe(parseISODate, () => {
  it("parses valid ISO date (YYYY-MM-DD)", () => {
    const result = parseISODate("2024-06-15")
    expect(result).toBeInstanceOf(Date)
    expect(result?.toISOString()).toBe("2024-06-15T00:00:00.000Z")
  })

  it("parses valid ISO datetime with Z timezone", () => {
    const result = parseISODate("2024-06-15T10:30:00Z")
    expect(result).toBeInstanceOf(Date)
    expect(result?.toISOString()).toBe("2024-06-15T10:30:00.000Z")
  })

  it("parses valid ISO datetime with timezone offset", () => {
    const result = parseISODate("2024-06-15T10:30:00+02:00")
    expect(result).toBeInstanceOf(Date)
    expect(result?.getTime()).toBe(new Date("2024-06-15T08:30:00Z").getTime())
  })

  it("parses valid ISO datetime with milliseconds", () => {
    const result = parseISODate("2024-06-15T10:30:00.123Z")
    expect(result).toBeInstanceOf(Date)
    expect(result?.toISOString()).toBe("2024-06-15T10:30:00.123Z")
  })

  it("returns null for completely invalid string", () => {
    expect(parseISODate("not-a-date")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseISODate("")).toBeNull()
  })

  it("returns null for non-ISO parseable string (e.g. 'June 15, 2024')", () => {
    // new Date("June 15, 2024") would succeed, but it's not ISO format
    expect(parseISODate("June 15, 2024")).toBeNull()
  })

  it("returns null for non-ISO parseable string (e.g. '06/15/2024')", () => {
    expect(parseISODate("06/15/2024")).toBeNull()
  })

  it("returns null for partial ISO format missing day", () => {
    expect(parseISODate("2024-06")).toBeNull()
  })
})

describe(PartitionFieldError, () => {
  it("has correct name property", () => {
    const error = new PartitionFieldError("event_date", "missing", 0)
    expect(error.name).toBe("PartitionFieldError")
  })

  it("is an instance of Error", () => {
    const error = new PartitionFieldError("event_date", "missing", 0)
    expect(error).toBeInstanceOf(Error)
  })

  it("includes value property for invalid_date reason", () => {
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
