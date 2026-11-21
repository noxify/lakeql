import { describe, expect, it } from "vitest"

import {
  partitioningValueForMode,
  partitionDateOptions,
  partitionRootOptions,
  partitionSearchOptions,
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

const regionCandidate = {
  id: "f1",
  name: "region",
  type: "String",
  isDateLike: false,
} as const
const eventCandidate = {
  id: "f2",
  name: "event",
  type: "DateTime",
  isDateLike: true,
} as const

describe("partitionRootOptions helper", () => {
  it("lists a non-date field as one bare option and skips date fields", () => {
    const options = partitionRootOptions(
      [regionCandidate, eventCandidate],
      new Set()
    )
    expect(options).toStrictEqual([
      {
        value: "f1",
        label: "region",
        shortLabel: "region",
        keywords: ["region"],
        segments: [{ fieldId: "f1" }],
      },
    ])
  })

  it("hides a chosen field and keeps same-named fields distinct", () => {
    const a = { ...regionCandidate, id: "a" }
    const b = { ...regionCandidate, id: "b" }
    expect(
      partitionRootOptions([a, b], new Set()).map((option) => option.value)
    ).toStrictEqual(["a", "b"])
    expect(
      partitionRootOptions([a, b], new Set(["a"])).map((option) => option.value)
    ).toStrictEqual(["b"])
  })
})

describe("partitionDateOptions helper", () => {
  it("offers the combined option first, then six components", () => {
    const options = partitionDateOptions(eventCandidate, new Set())
    expect(options.map((option) => option.value)).toStrictEqual([
      "f2:date",
      "f2:year",
      "f2:month",
      "f2:day",
      "f2:hour",
      "f2:minute",
      "f2:second",
    ])
    expect(options[0]).toStrictEqual({
      value: "f2:date",
      label: "event → year / month / day",
      shortLabel: "year / month / day",
      keywords: ["event year month day"],
      segments: [
        { fieldId: "f2", component: "year" },
        { fieldId: "f2", component: "month" },
        { fieldId: "f2", component: "day" },
      ],
    })
    expect(options[1]).toMatchObject({
      label: "event → year",
      segments: [{ fieldId: "f2", component: "year" }],
    })
  })

  it("hides chosen components and the combined option once any of its parts is chosen", () => {
    const options = partitionDateOptions(eventCandidate, new Set(["f2:month"]))
    expect(options.map((option) => option.value)).toStrictEqual([
      "f2:year",
      "f2:day",
      "f2:hour",
      "f2:minute",
      "f2:second",
    ])
    // Choosing an hour keeps the combined option available.
    expect(
      partitionDateOptions(eventCandidate, new Set(["f2:hour"]))[0]?.value
    ).toBe("f2:date")
  })
})

describe("partitionSearchOptions helper", () => {
  it("flattens fields and date components for cross search", () => {
    const options = partitionSearchOptions(
      [regionCandidate, eventCandidate],
      new Set(["f2:second"])
    )
    expect(options.map((option) => option.label)).toStrictEqual([
      "region",
      "event → year / month / day",
      "event → year",
      "event → month",
      "event → day",
      "event → hour",
      "event → minute",
    ])
    expect(
      options.find((option) => option.label === "event → year")?.keywords
    ).toStrictEqual(["event year"])
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
