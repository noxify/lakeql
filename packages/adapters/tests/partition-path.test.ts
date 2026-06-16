import { describe, expect, test } from "vitest"

import { generatePartitionPath, generateFlatPath } from "../src/write-pipeline"

// UUID v4 pattern
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

describe(generatePartitionPath, () => {
  test('format "year/month/day" produces year=YYYY/month=MM/day=DD/<uuid>.parquet', () => {
    const date = new Date("2024-03-15T10:30:00Z")
    const result = generatePartitionPath(date, "year/month/day")

    expect(result).toMatch(
      /^year=2024\/month=03\/day=15\/[0-9a-f-]+\.parquet$/u
    )
  })

  test('format "year/month" produces year=YYYY/month=MM/<uuid>.parquet', () => {
    const date = new Date("2024-03-15T10:30:00Z")
    const result = generatePartitionPath(date, "year/month")

    expect(result).toMatch(/^year=2024\/month=03\/[0-9a-f-]+\.parquet$/u)
  })

  test('format "year" produces year=YYYY/<uuid>.parquet', () => {
    const date = new Date("2024-03-15T10:30:00Z")
    const result = generatePartitionPath(date, "year")

    expect(result).toMatch(/^year=2024\/[0-9a-f-]+\.parquet$/u)
  })

  test('defaults to "year/month/day" format when format is not provided', () => {
    const date = new Date("2024-07-04T12:00:00Z")
    const result = generatePartitionPath(date)

    expect(result).toMatch(
      /^year=2024\/month=07\/day=04\/[0-9a-f-]+\.parquet$/u
    )
  })

  test("zero-pads month to 2 digits", () => {
    const date = new Date("2024-01-05T00:00:00Z")
    const result = generatePartitionPath(date, "year/month/day")

    expect(result).toMatch(/^year=2024\/month=01\/day=05\//u)
  })

  test("zero-pads day to 2 digits", () => {
    const date = new Date("2024-12-01T00:00:00Z")
    const result = generatePartitionPath(date, "year/month/day")

    expect(result).toMatch(/\/day=01\//u)
  })

  test("pads year to 4 digits", () => {
    // Edge case: year < 1000 (unlikely in practice)
    const date = new Date("0099-06-15T00:00:00Z")
    const result = generatePartitionPath(date, "year/month/day")

    expect(result).toMatch(/^year=0099\//u)
  })

  test("generates a valid UUID v4 in the filename", () => {
    const date = new Date("2024-03-15T10:30:00Z")
    const result = generatePartitionPath(date, "year/month/day")

    // Extract the UUID portion (between last / and .parquet)
    const uuid = result.split("/").pop()?.replace(".parquet", "")
    expect(uuid).toMatch(uuidV4Pattern)
  })

  test("uses UTC date components, not local time", () => {
    // This date is March 15 in UTC but could be March 14 in some timezones
    const date = new Date("2024-03-15T00:30:00Z")
    const result = generatePartitionPath(date, "year/month/day")

    expect(result).toMatch(/^year=2024\/month=03\/day=15\//u)
  })
})

describe(generateFlatPath, () => {
  test("returns <uuid>.parquet", () => {
    const result = generateFlatPath()

    expect(result).toMatch(/^[0-9a-f-]+\.parquet$/u)
  })

  test("contains a valid UUID v4", () => {
    const result = generateFlatPath()
    const uuid = result.replace(".parquet", "")

    expect(uuid).toMatch(uuidV4Pattern)
  })

  test("generates unique paths on each call", () => {
    const result1 = generateFlatPath()
    const result2 = generateFlatPath()

    expect(result1).not.toBe(result2)
  })
})
