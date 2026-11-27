import { describe, expect, it } from "vitest"

import { summarizeDiagnostics } from "@/components/studio/diagnostics"
import type { ValidationResult } from "@/core"
import { evaluate } from "@/core"
import { fromDefinition } from "@/core/mapping"
import { createFreshState } from "@/core/model"

describe("diagnostic summary", () => {
  it("returns no lines for a valid state", () => {
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
    expect(summarizeDiagnostics(valid)).toStrictEqual([])
  })

  it("prefixes a schema issue with its path when present", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [{ path: ["fields", 0, "name"], message: "Invalid input" }],
      duplicates: [],
      badRegex: [],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }
    expect(summarizeDiagnostics(result)).toStrictEqual([
      "fields.0.name: Invalid input",
    ])
  })

  it("describes duplicates and bad regex patterns", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [],
      duplicates: [{ name: "id", path: [] }],
      badRegex: [
        { pattern: "(", message: "Unterminated group", fieldId: "f1" },
      ],
      badNumber: [],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }
    expect(summarizeDiagnostics(result)).toStrictEqual([
      'Duplicate field "id"',
      'Invalid regex "(": Unterminated group',
    ])
  })

  it("describes a non-finite numeric bound", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [],
      duplicates: [],
      badRegex: [],
      badNumber: [{ kind: "min", value: Number.NaN, fieldId: "f1" }],
      reservedNames: [],
      autoFillPlacement: [],
      autoFillMutation: [],
      companionPartition: [],
      unresolvedPartition: [],
    }
    expect(summarizeDiagnostics(result)).toStrictEqual([
      "Min must be a finite number",
    ])
  })

  it("surfaces a real gate result for an invalid metadata state", () => {
    // A bad tableName makes the state invalid for export; the summary is
    // non-empty, which is what the top bar renders to block export.
    const state = { ...createFreshState(), tableName: "1bad" }
    const lines = summarizeDiagnostics(evaluate(state))
    expect(lines.length).toBeGreaterThan(0)
  })

  it("surfaces a duplicate-name gate result", () => {
    const state = fromDefinition({
      version: "2.0",
      tableName: "t",
      catalog: "c",
      schema: "s",
      fields: [
        { name: "id", type: "String" },
        { name: "id", type: "String" },
      ],
      mutation: false,
    })
    const lines = summarizeDiagnostics(evaluate(state))
    expect(
      lines.some((line) => line.includes('Duplicate field "id"'))
    ).toBeTruthy()
  })
})

describe("diagnostic summary — unresolved partition segments", () => {
  it("names a missing and an ambiguous partition field", () => {
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
        { name: "dup", component: "year", reason: "ambiguous" },
      ],
    }
    expect(summarizeDiagnostics(result)).toStrictEqual([
      'Partition field "ghost" does not exist',
      'Partition field "dup" matches more than one field',
    ])
  })
})
