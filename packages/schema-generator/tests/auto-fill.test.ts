import { describe, expect, it } from "vitest"

import {
  AUTO_FILL_WRITE_TIMESTAMP,
  autoFillCompanionNames,
  deriveAutoFillColumns,
  findReservedNameCollisions,
} from "../src/auto-fill"
import type { FieldDefinition } from "../src/endpoint-schema"

/** A top-level DateTime write-timestamp auto-fill field. */
function autoFillField(name: string): FieldDefinition {
  return { name, type: "DateTime", options: { autoFill: "write_timestamp" } }
}

describe("AUTO_FILL_WRITE_TIMESTAMP constant", () => {
  it("describes the write_timestamp companion suffixes", () => {
    expect(AUTO_FILL_WRITE_TIMESTAMP.kind).toBe("write_timestamp")
    expect(AUTO_FILL_WRITE_TIMESTAMP.yearSuffix).toBe("_year")
    expect(AUTO_FILL_WRITE_TIMESTAMP.monthSuffix).toBe("_month")
  })
})

describe(deriveAutoFillColumns, () => {
  it("derives _year and _month Integer companions for an auto-fill field", () => {
    expect(
      deriveAutoFillColumns(autoFillField("load_timestamp"))
    ).toStrictEqual([
      { name: "load_timestamp_year", type: "Integer" },
      { name: "load_timestamp_month", type: "Integer" },
    ])
  })

  it("returns [] for a DateTime field without autoFill", () => {
    expect(
      deriveAutoFillColumns({ name: "created_at", type: "DateTime" })
    ).toStrictEqual([])
  })

  it("returns [] for a non-DateTime field", () => {
    expect(deriveAutoFillColumns({ name: "id", type: "String" })).toStrictEqual(
      []
    )
  })
})

describe(autoFillCompanionNames, () => {
  it("returns the derived companion names", () => {
    expect(autoFillCompanionNames(autoFillField("event"))).toStrictEqual([
      "event_year",
      "event_month",
    ])
  })

  it("returns [] for a non-auto-fill field", () => {
    expect(
      autoFillCompanionNames({ name: "id", type: "String" })
    ).toStrictEqual([])
  })
})

describe(findReservedNameCollisions, () => {
  it("reports no collisions when names are distinct", () => {
    const fields: FieldDefinition[] = [
      { name: "id", type: "String" },
      autoFillField("load_timestamp"),
    ]
    expect(findReservedNameCollisions(fields)).toStrictEqual([])
  })

  it("reports a plain field colliding with a derived companion name", () => {
    const fields: FieldDefinition[] = [
      autoFillField("event"),
      { name: "event_year", type: "Integer" },
    ]
    expect(findReservedNameCollisions(fields)).toStrictEqual([
      { name: "event_year", reservedName: "event_year" },
    ])
  })

  it("reports a second auto-fill primary colliding with another's companion (event_year vs event)", () => {
    const fields: FieldDefinition[] = [
      autoFillField("event"),
      autoFillField("event_year"),
    ]
    expect(findReservedNameCollisions(fields)).toStrictEqual([
      { name: "event_year", reservedName: "event_year" },
    ])
  })

  it("ignores nested fields (top-level only)", () => {
    const fields: FieldDefinition[] = [
      autoFillField("event"),
      {
        name: "nested",
        type: "Object",
        fields: [{ name: "event_year", type: "Integer" }],
      },
    ]
    expect(findReservedNameCollisions(fields)).toStrictEqual([])
  })
})
