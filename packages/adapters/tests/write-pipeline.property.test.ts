// oxlint-disable import/no-named-as-default-member
// oxlint-disable vitest/max-expects

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { generatePartitionPath } from "../src/write-pipeline"

describe("Property 8: Partition Path Format", () => {
  const UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

  const PARTITION_PATH_REGEX =
    /^year=(?<year>\d{4})\/month=(?<month>\d{2})\/day=(?<day>\d{2})\/(?<uuid>[0-9a-f-]+)\.parquet$/u

  it("generates paths matching year=YYYY/month=MM/day=DD/<uuid>.parquet format", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("1000-01-01T00:00:00.000Z"),
          max: new Date("9999-12-31T23:59:59.999Z"),
        }),
        (date) => {
          const path = generatePartitionPath(date)

          // Assert overall format matches
          const match = path.match(PARTITION_PATH_REGEX)
          expect(match).not.toBeNull()

          if (!match?.groups) {
            return
          }

          const {
            year: yearStr,
            month: monthStr,
            day: dayStr,
            uuid: uuidStr,
          } = match.groups

          // Assert year, month, day correspond to UTC values of the input date
          const expectedYear = date.getUTCFullYear().toString()
          const expectedMonth = (date.getUTCMonth() + 1)
            .toString()
            .padStart(2, "0")
          const expectedDay = date.getUTCDate().toString().padStart(2, "0")

          expect(yearStr).toBe(expectedYear)
          expect(monthStr).toBe(expectedMonth)
          expect(dayStr).toBe(expectedDay)

          // Assert month and day are zero-padded (always 2 digits)
          expect(monthStr).toHaveLength(2)
          expect(dayStr).toHaveLength(2)

          // Assert the UUID portion is a valid UUID v4 format
          expect(uuidStr).toMatch(UUID_V4_REGEX)
        }
      ),
      { numRuns: 100 }
    )
  })
})
