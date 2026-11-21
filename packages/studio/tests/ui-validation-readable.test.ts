import { describe, expect, it } from "vitest"

import {
  metadataKeysWithIssues,
  partitioningIssueMessages,
  toReadableIssues,
} from "@/components/studio/validation-readable"
import type { EditorState, ValidationResult } from "@/core"
import { evaluate } from "@/core"
import { fromDefinition } from "@/core/mapping"

import { defined } from "./helpers"

/**
 * Unit tests for the readable-mapping layer (`toReadableIssues`). Pure, no DOM:
 * each diagnostic kind is reformatted into a labelled, optionally-navigable
 * entry. Field-keyed issues (schema/regex/number) resolve their label via the
 * `fieldNamePath` walk; duplicates use their already-name path directly; a
 * metadata issue with no `fieldId` is shown but not navigable.
 */

/** A state with a nested `address.postalCode` field, for ancestry labels. */
function nestedState(): EditorState {
  return fromDefinition({
    version: "2.0",
    tableName: "t",
    catalog: "c",
    schema: "s",
    fields: [
      {
        name: "address",
        type: "Object",
        fields: [{ name: "postalCode", type: "String" }],
      },
    ],
    mutation: false,
  })
}

/** The nested `postalCode` field's id within {@link nestedState}. */
function postalCodeId(state: EditorState): string {
  const address = defined(state.fields[0])
  const child = defined(defined(address.fields)[0])
  return child.id
}

describe("readable-mapping layer", () => {
  it("labels a nested schema issue with name + ancestry and marks it navigable", () => {
    const state = nestedState()
    const fieldId = postalCodeId(state)
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [
        {
          path: ["fields", 0, "fields", 0, "name"],
          message: "Invalid input",
          fieldId,
        },
      ],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }

    const issues = toReadableIssues(state, result)
    expect(issues).toHaveLength(1)
    const issue = defined(issues[0])
    expect(issue.label).toBe("address › postalCode")
    expect(issue.message).toBe("Field name is invalid")
    expect(issue.navigable).toBeTruthy()
    expect(issue.fieldId).toBe(fieldId)
  })

  it("maps a duplicate using its name path directly", () => {
    const state = nestedState()
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [],
      duplicates: [{ name: "postalCode", path: ["address"], fieldId: "dup-1" }],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }

    const issues = toReadableIssues(state, result)
    expect(issues).toHaveLength(1)
    const issue = defined(issues[0])
    expect(issue.label).toBe("address › postalCode")
    expect(issue.message).toBe("Duplicate field name at this level")
    expect(issue.navigable).toBeTruthy()
    expect(issue.fieldId).toBe("dup-1")
  })

  it("suppresses the duplicate issue for two empty-named fields, surfacing only the invalid-name issue per field", () => {
    // Two top-level fields, both still unnamed. The core gate reports each as an
    // invalid name AND the pair as a duplicate (both share name ""). The display
    // layer must drop the duplicate noise and keep one invalid-name issue each.
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        { name: "", type: "String" },
        { name: "", type: "String" },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    // The underlying export block must remain: empty names are non-exportable.
    expect(result.validForExport).toBeFalsy()
    expect(result.duplicates.length).toBeGreaterThan(0)

    const issues = toReadableIssues(state, result)
    const messages = issues.map((issue) => issue.message)
    expect(messages).not.toContain("Duplicate field name at this level")
    expect(
      messages.filter((message) => message === "Field name is invalid")
    ).toHaveLength(2)
  })

  it("still surfaces the duplicate issue for two fields with the same non-empty name", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [],
      duplicates: [{ name: "sku", path: [], fieldId: "dup-1" }],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }

    const issues = toReadableIssues(nestedState(), result)
    expect(issues).toHaveLength(1)
    const issue = defined(issues[0])
    expect(issue.message).toBe("Duplicate field name at this level")
    expect(issue.label).toBe("sku")
  })

  it("does not emit a duplicate issue for a single empty-named field", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [{ name: "", type: "String" }],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.duplicates).toHaveLength(0)

    const issues = toReadableIssues(state, result)
    const messages = issues.map((issue) => issue.message)
    expect(messages).not.toContain("Duplicate field name at this level")
    expect(
      messages.filter((message) => message === "Field name is invalid")
    ).toHaveLength(1)
  })

  it("resolves a bad-regex issue (fieldId-only) via the name walk", () => {
    // A real gate result: an unconstructible regex on the nested field.
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "address",
          type: "Object",
          fields: [
            {
              name: "postalCode",
              type: "String",
              options: { validations: [{ type: "regex", pattern: "(" }] },
            },
          ],
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.badRegex).toHaveLength(1)

    const issues = toReadableIssues(state, result)
    const regexIssue = defined(
      issues.find((issue) => issue.id.startsWith("regex-"))
    )
    expect(regexIssue.label).toBe("address › postalCode")
    expect(regexIssue.message).toBe(
      "Validation pattern is not a valid regular expression"
    )
    expect(regexIssue.navigable).toBeTruthy()
    expect(regexIssue.fieldId).toBe(defined(result.badRegex[0]).fieldId)
  })

  it("resolves a bad-number issue (fieldId-only) via the name walk", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        {
          name: "count",
          type: "Integer",
          options: { validations: [{ type: "min", value: Number.NaN }] },
        },
      ],
      mutation: false,
    })
    const result = evaluate(state)
    expect(result.badNumber).toHaveLength(1)

    const issues = toReadableIssues(state, result)
    const numberIssue = defined(
      issues.find((issue) => issue.id.startsWith("number-"))
    )
    expect(numberIssue.label).toBe("count")
    expect(numberIssue.message).toBe("min bound is not a finite number")
    expect(numberIssue.navigable).toBeTruthy()
  })

  it.each([
    { path: ["tableName"], metadataKey: "tableName", label: "Table name" },
    { path: ["catalog"], metadataKey: "catalog", label: "Catalog" },
    { path: ["schema"], metadataKey: "schema", label: "Schema" },
    { path: ["dataSource"], metadataKey: "dataSource", label: "Data source" },
    {
      path: ["mutation", "basePath"],
      metadataKey: "basePath",
      label: "Base path",
    },
  ] as const)(
    "marks the metadata issue for $metadataKey navigable with the right metadataKey",
    ({ path, metadataKey, label }) => {
      const state = nestedState()
      const result: ValidationResult = {
        validForExport: false,
        schemaIssues: [{ path: [...path], message: "Invalid input" }],
        duplicates: [],
        badRegex: [],
        badNumber: [],
        reservedNames: [],
        autoFillPlacement: [],
        autoFillMutation: [],
        companionPartition: [],
        unresolvedPartition: [],
      }

      const issues = toReadableIssues(state, result)
      expect(issues).toHaveLength(1)
      const issue = defined(issues[0])
      expect(issue.navigable).toBeTruthy()
      expect(issue.fieldId).toBeUndefined()
      expect(issue.metadataKey).toBe(metadataKey)
      expect(issue.label).toBe(label)
    }
  )

  it("keeps a version metadata issue non-navigable with no metadataKey", () => {
    const state = nestedState()
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [{ path: ["version"], message: "Invalid input" }],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }

    const issues = toReadableIssues(state, result)
    expect(issues).toHaveLength(1)
    const issue = defined(issues[0])
    expect(issue.navigable).toBeFalsy()
    expect(issue.fieldId).toBeUndefined()
    expect(issue.metadataKey).toBeUndefined()
    expect(issue.label).toBe("Version")
  })

  it("shows an unknown metadata leaf as non-navigable", () => {
    const state = nestedState()
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [{ path: ["somethingElse"], message: "Invalid input" }],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }

    const issues = toReadableIssues(state, result)
    expect(issues).toHaveLength(1)
    const issue = defined(issues[0])
    expect(issue.navigable).toBeFalsy()
    expect(issue.metadataKey).toBeUndefined()
  })

  it("shows a tableName metadata issue as navigable", () => {
    const state = nestedState()
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [{ path: ["tableName"], message: "Invalid input" }],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }

    const issues = toReadableIssues(state, result)
    expect(issues).toHaveLength(1)
    const issue = defined(issues[0])
    expect(issue.navigable).toBeTruthy()
    expect(issue.metadataKey).toBe("tableName")
    expect(issue.label).toBe("Table name")
    expect(issue.message).toBe("Table name is invalid")
  })

  it("returns no issues for a valid result", () => {
    const valid: ValidationResult = {
      validForExport: true,
      schemaIssues: [],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }
    expect(toReadableIssues(nestedState(), valid)).toStrictEqual([])
  })
})

describe("toReadableIssues — unresolved partition segments", () => {
  it("lists a missing and an ambiguous partition field as issues navigable to the picker", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [
        { name: "ghost", reason: "missing" },
        { name: "dup", reason: "ambiguous" },
      ],
    }

    const issues = toReadableIssues(nestedState(), result)
    expect(issues).toHaveLength(2)
    expect(
      issues.map(({ label, navigable, metadataKey }) => ({
        label,
        navigable,
        metadataKey,
      }))
    ).toStrictEqual([
      { label: "Partitioning", navigable: true, metadataKey: "partitioning" },
      { label: "Partitioning", navigable: true, metadataKey: "partitioning" },
    ])
    expect(defined(issues[0]).message).toContain('"ghost" does not exist')
    expect(defined(issues[1]).message).toContain(
      '"dup" matches more than one field'
    )
    expect(new Set(issues.map((issue) => issue.id)).size).toBe(2)
  })
})

describe("toReadableIssues — partitioning navigation", () => {
  it("makes a companion-column partition issue navigable to the picker", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [
        {
          segment: "event_year",
          companionName: "event_year",
          primaryName: "event",
        },
      ],
      unresolvedPartition: [],
    }
    const issue = defined(toReadableIssues(nestedState(), result)[0])
    expect(issue.navigable).toBeTruthy()
    expect(issue.metadataKey).toBe("partitioning")
  })

  it("makes a schema issue on the partitioning path navigable to the picker", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [
        { path: ["mutation", "partitioning"], message: "Too small" },
      ],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }
    const issue = defined(toReadableIssues(nestedState(), result)[0])
    expect(issue.navigable).toBeTruthy()
    expect(issue.metadataKey).toBe("partitioning")
    expect(issue.label).toBe("Partitioning")
  })
})

describe(partitioningIssueMessages, () => {
  it("returns the same text the Validations list shows, in list order", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [
        {
          segment: "event_year",
          companionName: "event_year",
          primaryName: "event",
        },
      ],
      unresolvedPartition: [{ name: "ghost", reason: "missing" }],
    }
    const messages = partitioningIssueMessages(nestedState(), result)
    const listed = toReadableIssues(nestedState(), result).map(
      (issue) => issue.message
    )
    expect(messages).toStrictEqual(listed)
    expect(messages).toHaveLength(2)
  })
})

describe(metadataKeysWithIssues, () => {
  const none: ValidationResult = {
    validForExport: false,
    schemaIssues: [],
    duplicates: [],
    badRegex: [],
    badNumber: [],
    reservedNames: [],
    autoFillPlacement: [],
    autoFillMutation: [],
    companionPartition: [],
    unresolvedPartition: [],
  }

  it("collects the Settings inputs named by metadata schema issues", () => {
    const keys = metadataKeysWithIssues({
      ...none,
      schemaIssues: [
        { path: ["tableName"], message: "Too small" },
        { path: ["mutation", "basePath"], message: "Too small" },
        { path: ["version"], message: "Invalid input" },
      ],
    })
    expect([...keys].toSorted()).toStrictEqual(["basePath", "tableName"])
  })

  it("ignores field-keyed schema issues", () => {
    const keys = metadataKeysWithIssues({
      ...none,
      schemaIssues: [
        { path: ["fields", 0, "name"], message: "Invalid", fieldId: "f1" },
      ],
    })
    expect(keys.size).toBe(0)
  })

  it("reports partitioning for companion and unresolved partition findings", () => {
    expect(
      metadataKeysWithIssues({
        ...none,
        unresolvedPartition: [{ name: "ghost", reason: "missing" }],
      }).has("partitioning")
    ).toBeTruthy()
    expect(
      metadataKeysWithIssues({
        ...none,
        companionPartition: [
          { segment: "e_year", companionName: "e_year", primaryName: "e" },
        ],
      }).has("partitioning")
    ).toBeTruthy()
  })
})

describe("partitioningIssueMessages — schema issues", () => {
  it("includes a schema issue on the partitioning value, and no other schema issue", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [
        { path: ["tableName"], message: "Too small" },
        {
          path: ["mutation", "partitioning"],
          message:
            'Choose at least one partition field, or set partitioning to "Off".',
        },
      ],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }
    expect(partitioningIssueMessages(nestedState(), result)).toStrictEqual([
      'Choose at least one partition field, or set partitioning to "Off".',
    ])
  })
})
