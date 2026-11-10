import { describe, expect, it } from "vitest"

import type { ValidationResult } from "@/core"
import { evaluate } from "@/core"
import { fromDefinition } from "@/core/mapping"
import { createFreshState } from "@/core/model"
import { summarizeDiagnostics } from "@/ui/diagnostics"

describe("diagnostic summary", () => {
  it("returns no lines for a valid state", () => {
    const valid: ValidationResult = {
      validForExport: true,
      schemaIssues: [],
      duplicates: [],
      badRegex: [],
    }
    expect(summarizeDiagnostics(valid)).toStrictEqual([])
  })

  it("prefixes a schema issue with its path when present", () => {
    const result: ValidationResult = {
      validForExport: false,
      schemaIssues: [{ path: ["fields", 0, "name"], message: "Invalid input" }],
      duplicates: [],
      badRegex: [],
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
    }
    expect(summarizeDiagnostics(result)).toStrictEqual([
      'Duplicate field "id"',
      'Invalid regex "(": Unterminated group',
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
      version: "1.0",
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
