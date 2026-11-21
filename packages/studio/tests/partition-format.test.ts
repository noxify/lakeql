import { describe, expect, it } from "vitest"

import {
  partitioningValueForMode,
  partitionOptionsFor,
  partitionSegmentKey,
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
      { id: "f1", name: "region", type: "String", isDateLike: false },
    ])
    expect(options).toStrictEqual([
      { value: "f1", label: "region", segment: { fieldId: "f1" } },
    ])
  })

  it("expands a Date/DateTime field into six component options", () => {
    const options = partitionOptionsFor([
      { id: "f2", name: "created_at", type: "DateTime", isDateLike: true },
    ])
    expect(options.map((option) => option.value)).toStrictEqual([
      "f2:year",
      "f2:month",
      "f2:day",
      "f2:hour",
      "f2:minute",
      "f2:second",
    ])
    expect(options[0]).toStrictEqual({
      value: "f2:year",
      label: "created_at → year",
      segment: { fieldId: "f2", component: "year" },
    })
  })
})

describe("partitionOptionsFor with same-named fields", () => {
  it("keeps two fields with the same name as distinct options", () => {
    const options = partitionOptionsFor(
      topLevelPartitionCandidates([
        field("region", "String", "a"),
        field("region", "String", "b"),
      ])
    )
    expect(options.map((option) => option.value)).toStrictEqual(["a", "b"])
  })
})

describe("segment keys", () => {
  it("keys resolved segments by id and unresolved ones by prefixed name", () => {
    expect(partitionSegmentKey({ fieldId: "f1" })).toBe("f1")
    expect(partitionSegmentKey({ fieldId: "f1", component: "day" })).toBe(
      "f1:day"
    )
    expect(partitionSegmentKey({ unresolvedName: "ghost" })).toBe("?ghost")
    expect(
      partitionSegmentKey({ unresolvedName: "ghost", component: "day" })
    ).toBe("?ghost:day")
  })
})

describe("partitioningValueForMode mapping", () => {
  it("maps off to false", () => {
    expect(partitioningValueForMode("off", [{ fieldId: "f1" }])).toBeFalsy()
  })

  it("keeps the current segments for field mode, else seeds an empty list", () => {
    const current = [{ fieldId: "f1", component: "year" }]
    expect(partitioningValueForMode("field", current)).toStrictEqual(current)
    expect(partitioningValueForMode("field", false)).toStrictEqual([])
  })
})
