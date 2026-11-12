import { describe, expect, it } from "vitest"

import {
  hasLoadTimestampCollision,
  parsePartitionSegments,
  partitioningValueForMode,
  partitionOptionsFor,
  serializePartitionSegments,
  topLevelPartitionCandidates,
} from "@/components/studio/partition-format"
import type { EditorField } from "@/core"

/** Builds a bare top-level editor field for candidate tests. */
function field(
  name: string,
  type: EditorField["type"],
  id = `id-${name}`
): EditorField {
  return { id, name, type }
}

describe("topLevelPartitionCandidates helper", () => {
  it("excludes Object and Array fields and empty-named fields", () => {
    const candidates = topLevelPartitionCandidates([
      field("region", "String"),
      field("profile", "Object"),
      field("tags", "Array"),
      field("", "String"),
      field("created_at", "DateTime"),
    ])
    expect(candidates.map((candidate) => candidate.name)).toStrictEqual([
      "region",
      "created_at",
    ])
  })

  it("flags Date and DateTime as date-like, others not", () => {
    const candidates = topLevelPartitionCandidates([
      field("region", "String"),
      field("d", "Date"),
      field("dt", "DateTime"),
      field("count", "Integer"),
    ])
    expect(
      candidates.map((candidate) => [candidate.name, candidate.isDateLike])
    ).toStrictEqual([
      ["region", false],
      ["d", true],
      ["dt", true],
      ["count", false],
    ])
  })
})

describe("partitionOptionsFor helper", () => {
  it("resolves a non-date primitive to a single bare option", () => {
    const options = partitionOptionsFor([
      { name: "region", type: "String", isDateLike: false },
    ])
    expect(options).toStrictEqual([
      { value: "region", label: "region", segment: { field: "region" } },
    ])
  })

  it("expands a Date/DateTime field into six component options", () => {
    const options = partitionOptionsFor([
      { name: "created_at", type: "DateTime", isDateLike: true },
    ])
    expect(options.map((option) => option.value)).toStrictEqual([
      "created_at:year",
      "created_at:month",
      "created_at:day",
      "created_at:hour",
      "created_at:minute",
      "created_at:second",
    ])
    expect(options[0]).toStrictEqual({
      value: "created_at:year",
      label: "created_at → year",
      segment: { field: "created_at", component: "year" },
    })
  })
})

describe("serializePartitionSegments / parsePartitionSegments", () => {
  it.each(["a", "a/b", "created_at:year/region", "d:year/d:month"])(
    "round-trips serialize(parse(s)) === s for %s",
    (value) => {
      expect(serializePartitionSegments(parsePartitionSegments(value))).toBe(
        value
      )
    }
  )

  it("tolerates partial input without throwing", () => {
    expect(parsePartitionSegments(":day")).toStrictEqual([
      { field: "", component: "day" },
    ])
  })

  it("parses an empty string to no segments", () => {
    expect(parsePartitionSegments("")).toStrictEqual([])
  })
})

describe("partitioningValueForMode mapping", () => {
  it("maps timestamp to true and off to false", () => {
    expect(partitioningValueForMode("timestamp", "created_at")).toBeTruthy()
    expect(partitioningValueForMode("off", "created_at")).toBeFalsy()
  })

  it("keeps the current string for field mode, else seeds an empty string", () => {
    expect(partitioningValueForMode("field", "created_at:year")).toBe(
      "created_at:year"
    )
    expect(partitioningValueForMode("field", true)).toBe("")
    expect(partitioningValueForMode("field", false)).toBe("")
  })
})

describe("hasLoadTimestampCollision helper", () => {
  it("is true when a top-level load_timestamp field exists", () => {
    expect(
      hasLoadTimestampCollision([
        field("id", "String"),
        field("load_timestamp", "DateTime"),
      ])
    ).toBeTruthy()
  })

  it("is false otherwise", () => {
    expect(hasLoadTimestampCollision([field("id", "String")])).toBeFalsy()
  })
})
