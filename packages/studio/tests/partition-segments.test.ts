import type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
import { describe, expect, it } from "vitest"

import type { EditorField, EditorState } from "@/core"
import {
  changeFieldType,
  evaluate,
  fromDefinition,
  importFromText,
  migrateEditorState,
  moveField,
  planFieldRemoval,
  planTypeChange,
  removeField,
  renameField,
  resolvePartitionString,
  serializePartitionSegments,
  toDefinition,
} from "@/core"
import type { StorageLike } from "@/core/persistence"
import { createPersistence } from "@/core/persistence"

import { defined } from "./helpers"

const YMD =
  "load_timestamp:year/load_timestamp:month/load_timestamp:day" as const

/** A definition with an enabled mutation partitioned by `partitioning`. */
function definitionWith(
  partitioning: string,
  fields: EndpointDefinitionFormat["fields"] = [
    { name: "load_timestamp", type: "DateTime" },
    { name: "region", type: "String" },
  ]
): EndpointDefinitionFormat {
  return {
    version: "2.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields,
    mutation: { loadStrategy: "append", basePath: "/d", partitioning },
  }
}

/** Reads the id-based segments of an enabled mutation. */
function segmentsOf(state: EditorState) {
  const { mutation } = state
  if (!mutation.enabled || mutation.partitioning === false) {
    throw new Error("expected by-field partitioning")
  }
  return mutation.partitioning
}

/** The exported partitioning string of a state. */
function exportedPartitioning(state: EditorState): unknown {
  const { mutation } = toDefinition(state)
  return mutation === false || mutation === undefined
    ? false
    : mutation.partitioning
}

describe("id-based partition segments: import", () => {
  it("resolves names to field ids and keeps component text", () => {
    const state = fromDefinition(definitionWith(`${YMD}/region`))
    const [ts, region] = state.fields as [EditorField, EditorField]
    expect(segmentsOf(state)).toStrictEqual([
      { fieldId: ts.id, component: "year" },
      { fieldId: ts.id, component: "month" },
      { fieldId: ts.id, component: "day" },
      { fieldId: region.id },
    ])
  })

  it("keeps a name with no matching field as an unresolved segment", () => {
    const state = fromDefinition(definitionWith("ghost:year/region"))
    const region = defined(state.fields[1])
    expect(segmentsOf(state)).toStrictEqual([
      { unresolvedName: "ghost", component: "year" },
      { fieldId: region.id },
    ])
  })

  it("keeps a duplicated name unresolved instead of guessing", () => {
    const state = fromDefinition(
      definitionWith("region", [
        { name: "region", type: "String" },
        { name: "region", type: "String" },
      ])
    )
    expect(segmentsOf(state)).toStrictEqual([{ unresolvedName: "region" }])
  })

  it("blocks export for an unresolved segment, by grammar or by unknown name", () => {
    // A grammar-invalid component is flagged by the schema; a well-formed name
    // that matches no single field is flagged by the unresolved-segment finding
    // (the schema alone does not check that the name exists).
    expect(
      evaluate(fromDefinition(definitionWith("ghost:bogus"))).validForExport
    ).toBeFalsy()
    expect(
      evaluate(fromDefinition(definitionWith("ghost"))).validForExport
    ).toBeFalsy()
    expect(
      evaluate(fromDefinition(definitionWith("region:bogus"))).validForExport
    ).toBeFalsy()
  })

  it.each([
    "region",
    YMD,
    `${YMD}/region`,
    "ghost",
    "ghost:year/region",
    "region:bogus",
    "region/",
    "a:b:c",
  ])("round-trips %s byte-identically through export", (partitioning) => {
    const def = definitionWith(partitioning)
    const state = fromDefinition(def)
    expect(exportedPartitioning(state)).toBe(partitioning)
    const exported = JSON.parse(exportToJsonUnchecked(state)) as unknown
    expect(exported).toStrictEqual(toDefinition(state))
  })

  it("round-trips an unresolved duplicate-name path unchanged", () => {
    const state = fromDefinition(
      definitionWith("region:year", [
        { name: "region", type: "String" },
        { name: "region", type: "String" },
      ])
    )
    expect(exportedPartitioning(state)).toBe("region:year")
  })

  it("imports through importFromText and exports the same string", () => {
    const text = JSON.stringify(definitionWith(`${YMD}/region`))
    const result = importFromText(text)
    expect(result.ok).toBeTruthy()
    if (!result.ok) {
      throw new Error("import failed")
    }
    expect(exportedPartitioning(result.state)).toBe(`${YMD}/region`)
  })

  it("keeps the off state as false", () => {
    const state = fromDefinition({
      ...definitionWith("x"),
      mutation: { loadStrategy: "append", basePath: "/d", partitioning: false },
    })
    expect(state.mutation).toMatchObject({ partitioning: false })
  })
})

/** Serializes a state's candidate definition (ignores the validity gate). */
function exportToJsonUnchecked(state: EditorState): string {
  return JSON.stringify(toDefinition(state))
}

describe("id-based partition segments: rename and duplicates", () => {
  it("keeps segments pointing at a renamed field and re-exports its new name", () => {
    const state = fromDefinition(definitionWith(YMD))
    const renamed = renameField(state, [0], "written_at")
    expect(segmentsOf(renamed)).toStrictEqual(segmentsOf(state))
    expect(exportedPartitioning(renamed)).toBe(
      "written_at:year/written_at:month/written_at:day"
    )
    expect(evaluate(renamed).validForExport).toBeTruthy()
  })

  it("keeps an existing segment unambiguous when another field takes its name", () => {
    const state = fromDefinition(definitionWith("region"))
    const region = defined(state.fields[1])
    // Rename the first field to "region": a duplicate name now exists.
    const dup = renameField(state, [0], "region")
    expect(segmentsOf(dup)).toStrictEqual([{ fieldId: region.id }])
    const [, second] = dup.fields as [EditorField, EditorField]
    expect(second.id).toBe(region.id)
  })

  it("serializes by the referenced field's name even with same-named fields", () => {
    const fields: EditorField[] = [
      { id: "a", name: "x", type: "String" },
      { id: "b", name: "x", type: "String" },
    ]
    expect(
      serializePartitionSegments([{ fieldId: "b" }, { fieldId: "a" }], fields)
    ).toBe("x/x")
  })

  it("keeps segments attached when the referenced field is moved", () => {
    const state = fromDefinition(
      definitionWith("region", [
        {
          name: "box",
          type: "Object",
          fields: [{ name: "y", type: "String" }],
        },
        { name: "region", type: "String" },
      ])
    )
    const box = defined(state.fields[0])
    const region = defined(state.fields[1])
    const moved = moveField(state, region.id, {
      containerId: box.id,
      beforeId: null,
    })
    expect(segmentsOf(moved)).toStrictEqual([{ fieldId: region.id }])
  })
})

describe("removing a referenced field", () => {
  it("names the affected segments in the removal plan", () => {
    const state = fromDefinition(definitionWith(`${YMD}/region`))
    expect(
      planFieldRemoval(state, [0]).affectedPartitionSegments
    ).toStrictEqual([
      "load_timestamp → year",
      "load_timestamp → month",
      "load_timestamp → day",
    ])
    expect(
      planFieldRemoval(state, [1]).affectedPartitionSegments
    ).toStrictEqual(["region"])
  })

  it("plans no segments for a field the partitioning does not reference", () => {
    const state = fromDefinition(
      definitionWith("region", [
        { name: "region", type: "String" },
        { name: "other", type: "String" },
      ])
    )
    expect(
      planFieldRemoval(state, [1]).affectedPartitionSegments
    ).toStrictEqual([])
    expect(removeField(state, [1]).mutation).toStrictEqual(state.mutation)
  })

  it("removes the field and only its segments, keeping the rest", () => {
    const state = fromDefinition(definitionWith(`${YMD}/region`))
    const region = defined(state.fields[1])
    const next = removeField(state, [0])
    expect(next.fields.map((field) => field.name)).toStrictEqual(["region"])
    expect(segmentsOf(next)).toStrictEqual([{ fieldId: region.id }])
    expect(exportedPartitioning(next)).toBe("region")
  })

  it("leaves unresolved segments alone", () => {
    const state = fromDefinition(definitionWith("ghost/region"))
    const next = removeField(state, [1])
    expect(segmentsOf(next)).toStrictEqual([{ unresolvedName: "ghost" }])
  })

  it("leaves an empty by-field selection when no segment remains", () => {
    const state = fromDefinition(definitionWith("region"))
    const next = removeField(state, [1])
    expect(segmentsOf(next)).toStrictEqual([])
  })

  it("drops segments of a field nested in a removed Object", () => {
    const state = fromDefinition(
      definitionWith("region", [{ name: "region", type: "String" }])
    )
    // Nest the referenced field to prove subtree ids are covered.
    const region = defined(state.fields[0])
    const wrapped: EditorState = {
      ...state,
      fields: [{ id: "box", name: "box", type: "Object", fields: [region] }],
    }
    const next = removeField(wrapped, [0])
    expect(segmentsOf(next)).toStrictEqual([])
  })

  it("does not touch partitioning that is off", () => {
    const state = fromDefinition({
      ...definitionWith("x"),
      mutation: { loadStrategy: "append", basePath: "/d", partitioning: false },
    })
    expect(removeField(state, [0]).mutation).toStrictEqual(state.mutation)
  })
})

describe("type changes that invalidate a segment", () => {
  it("needs confirmation and names the segments when a date field becomes a non-date", () => {
    const state = fromDefinition(definitionWith(`${YMD}/region`))
    const field = defined(state.fields[0])
    const plan = planTypeChange(field, "String", state)
    expect(plan.needsConfirmation).toBeTruthy()
    expect(plan.affectedPartitionSegments).toStrictEqual([
      "load_timestamp → year",
      "load_timestamp → month",
      "load_timestamp → day",
    ])
    expect(plan.lostDescription).toContain("load_timestamp → year")
  })

  it("does not apply without confirm, and applies with confirm removing exactly those segments", () => {
    const state = fromDefinition(definitionWith(`${YMD}/region`))
    const region = defined(state.fields[1])

    const dry = changeFieldType(state, [0], "String")
    expect(dry.applied).toBeFalsy()
    expect(dry.state).toBe(state)

    const applied = changeFieldType(state, [0], "String", { confirm: true })
    expect(applied.applied).toBeTruthy()
    expect(defined(applied.state.fields[0]).type).toBe("String")
    expect(segmentsOf(applied.state)).toStrictEqual([{ fieldId: region.id }])
  })

  it("treats a change to Object/Array as invalidating any segment", () => {
    const state = fromDefinition(definitionWith("region"))
    const field = defined(state.fields[1])
    expect(
      planTypeChange(field, "Object", state).affectedPartitionSegments
    ).toStrictEqual(["region"])
    expect(planTypeChange(field, "Array", state).needsConfirmation).toBeTruthy()
    const applied = changeFieldType(state, [1], "Object", { confirm: true })
    expect(segmentsOf(applied.state)).toStrictEqual([])
  })

  it("keeps current behavior when no segment is affected", () => {
    const state = fromDefinition(definitionWith(`${YMD}/region`))
    const date = defined(state.fields[0])
    const region = defined(state.fields[1])
    // Date-like to date-like keeps component segments valid.
    expect(planTypeChange(date, "Date", state).needsConfirmation).toBeFalsy()
    // A bare segment stays valid for any primitive.
    expect(
      planTypeChange(region, "Integer", state).needsConfirmation
    ).toBeFalsy()
    const applied = changeFieldType(state, [1], "Integer")
    expect(applied.applied).toBeTruthy()
    expect(segmentsOf(applied.state)).toStrictEqual(segmentsOf(state))
    // Without a state, partitioning is ignored.
    expect(planTypeChange(date, "String").needsConfirmation).toBeFalsy()
  })

  it("only removes the changed field's segments, leaving unresolved ones", () => {
    const state = fromDefinition(definitionWith("ghost/load_timestamp:year"))
    const applied = changeFieldType(state, [0], "String", { confirm: true })
    expect(segmentsOf(applied.state)).toStrictEqual([
      { unresolvedName: "ghost" },
    ])
  })
})

describe("legacy draft migration", () => {
  it("resolves a name-based string partitioning to segments", () => {
    const state = fromDefinition(definitionWith("region"))
    const legacy = {
      ...state,
      mutation: { ...state.mutation, partitioning: `${YMD}/region/ghost` },
    } as unknown as EditorState
    const migrated = migrateEditorState(legacy)
    const [ts, region] = state.fields as [EditorField, EditorField]
    expect(segmentsOf(migrated)).toStrictEqual([
      { fieldId: ts.id, component: "year" },
      { fieldId: ts.id, component: "month" },
      { fieldId: ts.id, component: "day" },
      { fieldId: region.id },
      { unresolvedName: "ghost" },
    ])
    expect(exportedPartitioning(migrated)).toBe(`${YMD}/region/ghost`)
  })

  it("migrates an empty legacy string to an empty selection and leaves new drafts alone", () => {
    const state = fromDefinition(definitionWith("region"))
    const legacyEmpty = {
      ...state,
      mutation: { ...state.mutation, partitioning: "" },
    } as unknown as EditorState
    expect(segmentsOf(migrateEditorState(legacyEmpty))).toStrictEqual([])
    expect(migrateEditorState(state)).toBe(state)
  })

  it("converts a string partitioning on restore from storage", () => {
    const state = fromDefinition(definitionWith(YMD))
    const legacy = {
      ...state,
      mutation: { ...state.mutation, partitioning: YMD },
    } as unknown as EditorState
    const map = new Map<string, string>()
    const storage: StorageLike = {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => {
        map.set(key, value)
      },
      removeItem: (key) => {
        map.delete(key)
      },
    }
    // Write the legacy-shaped draft exactly as an older build would have.
    const first = createPersistence({ storage, eventTarget: undefined })
    first.save(legacy)
    first.flush()
    first.dispose()

    const second = createPersistence({ storage, eventTarget: undefined })
    const restored = second.restore()
    second.dispose()
    expect(segmentsOf(restored)).toHaveLength(3)
    expect(exportedPartitioning(restored)).toBe(YMD)
    expect(evaluate(restored).validForExport).toBeTruthy()
  })

  it("resolves names against top-level fields only", () => {
    expect(
      resolvePartitionString("x", [
        {
          id: "o",
          name: "o",
          type: "Object",
          fields: [{ id: "n", name: "x", type: "String" }],
        },
      ])
    ).toStrictEqual([{ unresolvedName: "x" }])
  })
})
