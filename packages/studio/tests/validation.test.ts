import { describe, expect, it } from "vitest"

import { addField, createField } from "@/core"
import { fromDefinition } from "@/core/mapping"
import type { EditorState } from "@/core/model"
import { createFreshState } from "@/core/model"
import {
  EMPTY_PARTITIONING_MESSAGE,
  evaluate,
  isValidForExport,
} from "@/core/validation"

import { defined } from "./helpers"

function goodState(): EditorState {
  return fromDefinition({
    version: "2.0",
    tableName: "events",
    catalog: "main",
    schema: "public",
    fields: [
      { name: "id", type: "String", options: { required: true } },
      {
        name: "profile",
        type: "Object",
        fields: [{ name: "city", type: "String" }],
      },
    ],
    mutation: { loadStrategy: "append", basePath: "/data" },
  })
}

describe("valid-for-export gate", () => {
  it("accepts a good definition", () => {
    const result = evaluate(goodState())
    expect(result.validForExport).toBeTruthy()
    expect(result.schemaIssues).toStrictEqual([])
    expect(result.duplicates).toStrictEqual([])
    expect(result.badRegex).toStrictEqual([])
  })

  it("accepts an empty top-level fields array", () => {
    const state: EditorState = {
      ...createFreshState(),
      tableName: "t",
      catalog: "c",
      schema: "s",
    }
    expect(isValidForExport(state)).toBeTruthy()
  })

  it("rejects a schema-invalid metadata field and keys the issue to the path", () => {
    const state: EditorState = {
      ...createFreshState(),
      tableName: "1bad", // leading digit violates metadataFieldPattern
      catalog: "c",
      schema: "s",
    }
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(
      result.schemaIssues.some((issue) => issue.path[0] === "tableName")
    ).toBeTruthy()
  })

  it("rejects an empty Object (schema .min(1)) and keys it to the field id", () => {
    const state = goodState()
    const objectField = defined(state.fields[1]) // "profile"
    objectField.fields = []
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(
      result.schemaIssues.some((issue) => issue.fieldId === objectField.id)
    ).toBeTruthy()
  })

  it("rejects duplicate field names with the duplicate's field id", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        { name: "dup", type: "String" },
        { name: "dup", type: "Integer" },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(result.duplicates).toHaveLength(1)
    expect(defined(result.duplicates[0]).name).toBe("dup")
    // The duplicate is the second "dup".
    expect(defined(result.duplicates[0]).fieldId).toBe(
      defined(state.fields[1]).id
    )
  })

  it("rejects duplicate field names nested inside an Object", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "obj",
          type: "Object",
          fields: [
            { name: "a", type: "String" },
            { name: "a", type: "Integer" },
          ],
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const duplicate = defined(result.duplicates[0])
    expect(duplicate.name).toBe("a")
    expect(duplicate.path).toStrictEqual(["obj"])
    const innerFields = defined(defined(state.fields[0]).fields)
    expect(duplicate.fieldId).toBe(defined(innerFields[1]).id)
  })

  it("rejects an unconstructible regex pattern with the field id", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "code",
          type: "String",
          options: { validations: [{ type: "regex", pattern: "([" }] },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(result.badRegex).toHaveLength(1)
    const bad = defined(result.badRegex[0])
    expect(bad.pattern).toBe("([")
    expect(bad.fieldId).toBe(defined(state.fields[0]).id)
  })

  it("accepts a constructible regex pattern", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "code",
          type: "String",
          options: { validations: [{ type: "regex", pattern: "^[A-Z]{3}$" }] },
        },
      ],
      mutation: false,
    })
    expect(isValidForExport(state)).toBeTruthy()
  })

  it("rejects a non-finite min/max bound with the field id", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "score",
          type: "Integer",
          options: { validations: [{ type: "min", value: Number.NaN }] },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(result.badNumber).toHaveLength(1)
    const bad = defined(result.badNumber[0])
    expect(bad.kind).toBe("min")
    expect(bad.fieldId).toBe(defined(state.fields[0]).id)
  })

  it("rejects an infinite max bound", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "score",
          type: "Float",
          options: {
            validations: [{ type: "max", value: Number.POSITIVE_INFINITY }],
          },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(defined(result.badNumber[0]).kind).toBe("max")
  })

  it("accepts a finite min/max bound", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "score",
          type: "Integer",
          options: { validations: [{ type: "min", value: 0 }] },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeTruthy()
    expect(result.badNumber).toStrictEqual([])
  })

  it("detects a non-finite bound nested inside an Array-of-Object item", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "items",
          type: "Array",
          items: {
            type: "Object",
            fields: [
              {
                name: "qty",
                type: "Integer",
                options: { validations: [{ type: "min", value: Number.NaN }] },
              },
            ],
          },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const itemFields = defined(defined(state.fields[0]).items).fields
    expect(defined(result.badNumber[0]).fieldId).toBe(
      defined(defined(itemFields)[0]).id
    )
  })

  it("detects a bad regex nested inside an Array-of-Object item", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "items",
          type: "Array",
          items: {
            type: "Object",
            fields: [
              {
                name: "ref",
                type: "String",
                options: { validations: [{ type: "regex", pattern: "(" }] },
              },
            ],
          },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const itemFields = defined(defined(state.fields[0]).items).fields
    expect(defined(result.badRegex[0]).fieldId).toBe(
      defined(defined(itemFields)[0]).id
    )
  })
})

/** An enabled append mutation with the given partitioning value. */
function appendMutation(partitioning: false | string = false): {
  loadStrategy: "append"
  basePath: string
  partitioning: false | string
} {
  return { loadStrategy: "append", basePath: "/d", partitioning }
}

/** A state with one DateTime field partitioned by `partitioning`. */
function dateStateWith(partitioning: string): EditorState {
  return fromDefinition({
    version: "2.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [{ name: "event", type: "DateTime" }],
    mutation: appendMutation(partitioning),
  })
}

describe("date partition segments need a component", () => {
  it("blocks export for a bare DateTime segment with the component hint", () => {
    const result = evaluate(dateStateWith("event"))
    expect(result.validForExport).toBeFalsy()
    expect(
      result.schemaIssues.some(
        (issue) =>
          issue.path.join(".") === "mutation.partitioning" &&
          issue.message.includes("event:year")
      )
    ).toBeTruthy()
  })

  it("accepts a DateTime segment with a component", () => {
    expect(evaluate(dateStateWith("event:year")).validForExport).toBeTruthy()
  })
})
describe("auto-fill validations (FR4.6)", () => {
  it("accepts a valid top-level DateTime auto-fill field under an append mutation", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        { name: "id", type: "String" },
        {
          name: "load_timestamp",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ],
      mutation: appendMutation(),
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeTruthy()
    expect(result.autoFillPlacement).toStrictEqual([])
    expect(result.autoFillMutation).toStrictEqual([])
    expect(result.reservedNames).toStrictEqual([])
    expect(result.companionPartition).toStrictEqual([])
  })

  it("rejects auto-fill on a non-DateTime field, keyed to the field id", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "label",
          type: "String",
          options: { autoFill: "write_timestamp" },
        },
      ],
      mutation: appendMutation(),
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const placement = defined(result.autoFillPlacement[0])
    expect(placement.reason).toBe("non-datetime")
    expect(placement.name).toBe("label")
    expect(placement.fieldId).toBe(defined(state.fields[0]).id)
  })

  it("rejects auto-fill nested at depth 1 inside an Object", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "meta",
          type: "Object",
          fields: [
            {
              name: "stamp",
              type: "DateTime",
              options: { autoFill: "write_timestamp" },
            },
          ],
        },
      ],
      mutation: appendMutation(),
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const placement = defined(
      result.autoFillPlacement.find((bad) => bad.reason === "nested")
    )
    expect(placement.name).toBe("stamp")
    const inner = defined(defined(defined(state.fields[0]).fields)[0])
    expect(placement.fieldId).toBe(inner.id)
  })

  it("rejects auto-fill nested at depth 2 inside an Array-of-Object", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "rows",
          type: "Array",
          items: {
            type: "Object",
            fields: [
              {
                name: "stamp",
                type: "DateTime",
                options: { autoFill: "write_timestamp" },
              },
            ],
          },
        },
      ],
      mutation: appendMutation(),
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const placement = defined(
      result.autoFillPlacement.find((bad) => bad.reason === "nested")
    )
    expect(placement.name).toBe("stamp")
    const itemFields = defined(defined(state.fields[0]).items).fields
    expect(placement.fieldId).toBe(defined(defined(itemFields)[0]).id)
  })

  it("rejects auto-fill with full_load (needs append/full_load_append)", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "load_timestamp",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ],
      mutation: {
        loadStrategy: "full_load",
        basePath: "/d",
        partitioning: false,
      },
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const finding = defined(result.autoFillMutation[0])
    expect(finding.name).toBe("load_timestamp")
    expect(finding.reason).toBe("load-strategy")
    expect(finding.fieldId).toBe(defined(state.fields[0]).id)
  })

  it("rejects auto-fill with no enabled mutation", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "load_timestamp",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const finding = defined(result.autoFillMutation[0])
    expect(finding.reason).toBe("mutation-disabled")
  })

  it("accepts auto-fill with full_load_append", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "load_timestamp",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ],
      mutation: {
        loadStrategy: "full_load_append",
        basePath: "/d",
        partitioning: false,
      },
    })
    const result = evaluate(state)
    expect(result.autoFillMutation).toStrictEqual([])
    expect(result.validForExport).toBeTruthy()
  })

  it("rejects a reserved-name collision (event_year vs event), keyed to the colliding field", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "event",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
        { name: "event_year", type: "Integer" },
      ],
      mutation: appendMutation(),
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const collision = defined(result.reservedNames[0])
    expect(collision.name).toBe("event_year")
    expect(collision.fieldId).toBe(defined(state.fields[1]).id)
  })

  it("rejects a bare companion-column partition segment (event_year)", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "event",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ],
      mutation: appendMutation("event_year"),
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    const finding = defined(result.companionPartition[0])
    expect(finding.companionName).toBe("event_year")
    expect(finding.primaryName).toBe("event")
  })

  it("rejects a companion-column partition segment with a component (event_year:year)", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "event",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ],
      mutation: appendMutation("event_year:year"),
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(defined(result.companionPartition[0]).companionName).toBe(
      "event_year"
    )
  })

  it("accepts the primary component form event:year as a partition segment", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "event",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ],
      mutation: appendMutation("event:year/event:month"),
    })
    const result = evaluate(state)
    expect(result.companionPartition).toStrictEqual([])
    expect(result.validForExport).toBeTruthy()
  })
})

/** An endpoint with a `region` field and the given imported partitioning. */
function withPartitioning(partitioning: string): EditorState {
  return fromDefinition({
    version: "2.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [{ name: "region", type: "String" }],
    mutation: appendMutation(partitioning),
  })
}

describe("unresolved partition segments", () => {
  it("accepts a segment that resolves to exactly one field", () => {
    const result = evaluate(withPartitioning("region"))
    expect(result.unresolvedPartition).toStrictEqual([])
    expect(result.validForExport).toBeTruthy()
  })

  it("flags a well-formed segment naming a field that does not exist", () => {
    const result = evaluate(withPartitioning("ghost"))
    expect(result.validForExport).toBeFalsy()
    expect(result.unresolvedPartition).toStrictEqual([
      { name: "ghost", reason: "missing" },
    ])
  })

  it("keeps the component of an unresolved date-component segment", () => {
    const result = evaluate(withPartitioning("region/ghost:year"))
    expect(result.validForExport).toBeFalsy()
    expect(result.unresolvedPartition).toStrictEqual([
      { name: "ghost", component: "year", reason: "missing" },
    ])
  })

  it("flags a segment whose name matches more than one field as ambiguous", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        { name: "dup", type: "String" },
        { name: "dup", type: "String" },
      ],
      mutation: appendMutation("dup"),
    })
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(result.unresolvedPartition).toStrictEqual([
      { name: "dup", reason: "ambiguous" },
    ])
  })

  it("clears the finding once a field with that name exists", () => {
    const state = withPartitioning("ghost")
    expect(evaluate(state).unresolvedPartition).toHaveLength(1)

    const withField = addField(state, [], {
      ...createField("String"),
      name: "ghost",
    })
    const result = evaluate(withField)
    expect(result.unresolvedPartition).toStrictEqual([])
    expect(result.validForExport).toBeTruthy()
  })

  it("does not double-report a segment the schema already rejects", () => {
    const result = evaluate(withPartitioning("ghost:bogus"))
    expect(result.validForExport).toBeFalsy()
    expect(result.schemaIssues.length).toBeGreaterThan(0)
    expect(result.unresolvedPartition).toStrictEqual([])
  })

  it("does not double-report a derived companion column segment", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "event",
          type: "DateTime",
          options: { autoFill: "write_timestamp" },
        },
      ],
      mutation: appendMutation("event_year"),
    })
    const result = evaluate(state)
    expect(result.companionPartition).toHaveLength(1)
    expect(result.unresolvedPartition).toStrictEqual([])
  })

  it("reports nothing when partitioning is off", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [{ name: "region", type: "String" }],
      mutation: { loadStrategy: "append", basePath: "/d", partitioning: false },
    })
    const result = evaluate(state)
    expect(result.unresolvedPartition).toStrictEqual([])
    expect(result.validForExport).toBeTruthy()
  })
})

describe("empty by-field partitioning", () => {
  it("reports one readable issue instead of two raw schema issues", () => {
    const base = withPartitioning("region")
    const state: EditorState = base.mutation.enabled
      ? { ...base, mutation: { ...base.mutation, partitioning: [] } }
      : base
    const result = evaluate(state)
    expect(result.validForExport).toBeFalsy()
    expect(
      result.schemaIssues.filter(
        (issue) => issue.path.join(".") === "mutation.partitioning"
      )
    ).toStrictEqual([
      {
        path: ["mutation", "partitioning"],
        message: EMPTY_PARTITIONING_MESSAGE,
      },
    ])
  })

  it("keeps the schema's own messages for a non-empty but invalid selection", () => {
    const result = evaluate(withPartitioning("ghost:bogus"))
    const messages = result.schemaIssues
      .filter((issue) => issue.path.join(".") === "mutation.partitioning")
      .map((issue) => issue.message)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages).not.toContain(EMPTY_PARTITIONING_MESSAGE)
  })
})
