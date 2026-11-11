import { describe, expect, it } from "vitest"

import type { EditorState, ValidationResult } from "@/core"
import { evaluate } from "@/core"
import { fromDefinition } from "@/core/mapping"
import { toReadableIssues } from "@/ui/validation-readable"

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
    version: "1.0",
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
      version: "1.0",
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
    }

    const issues = toReadableIssues(nestedState(), result)
    expect(issues).toHaveLength(1)
    const issue = defined(issues[0])
    expect(issue.message).toBe("Duplicate field name at this level")
    expect(issue.label).toBe("sku")
  })

  it("does not emit a duplicate issue for a single empty-named field", () => {
    const state = fromDefinition({
      version: "1.0",
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
      version: "1.0",
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
      version: "1.0",
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

  it("shows a metadata issue with no fieldId as non-navigable", () => {
    const state = nestedState()
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [{ path: ["tableName"], message: "Invalid input" }],
      duplicates: [],
      badRegex: [],
      badNumber: [],
    }

    const issues = toReadableIssues(state, result)
    expect(issues).toHaveLength(1)
    const issue = defined(issues[0])
    expect(issue.navigable).toBeFalsy()
    expect(issue.fieldId).toBeUndefined()
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
    }
    expect(toReadableIssues(nestedState(), valid)).toStrictEqual([])
  })
})
