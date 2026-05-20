import type { CompiledQuery } from "kysely"
import { describe, expect, test, vi } from "vitest"

import { formatQuery } from "../src"

const mocks = vi.hoisted(() => ({
  format: vi.fn<(sql: string, options: unknown) => string>(
    (sql, options) =>
      `FORMATTED: ${sql} WITH OPTIONS ${JSON.stringify(options)}`
  ),
}))

// Mock sql-formatter
vi.mock(import("sql-formatter"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    format: mocks.format as unknown as typeof actual.format,
  }
})

describe(formatQuery, () => {
  test("should format SQL query with string parameters", () => {
    const mockQuery: CompiledQuery<unknown> = {
      parameters: ["value1", "value2"],
      query: { kind: "RawNode", parameters: [], sqlFragments: [] },
      queryId: { queryId: "test" },
      sql: "SELECT * FROM table WHERE field = $1 AND another_field = $2",
    }

    const result = formatQuery({ query: mockQuery })

    expect(result).toBe(
      `FORMATTED: SELECT * FROM table WHERE field = $1 AND another_field = $2 WITH OPTIONS ${JSON.stringify(
        {
          keywordCase: "upper",
          language: "postgresql",
          params: { 1: "'value1'", 2: "'value2'" },
          tabWidth: 0,
          useTabs: false,
        }
      )}`
    )
  })

  test("should format SQL query with numeric parameters", () => {
    const mockQuery: CompiledQuery<unknown> = {
      parameters: [123, 45.67],
      query: { kind: "RawNode", parameters: [], sqlFragments: [] },
      queryId: { queryId: "test" },
      sql: "SELECT * FROM table WHERE id = $1 AND price > $2",
    }

    const result = formatQuery({ query: mockQuery })

    expect(result).toBe(
      `FORMATTED: SELECT * FROM table WHERE id = $1 AND price > $2 WITH OPTIONS ${JSON.stringify(
        {
          keywordCase: "upper",
          language: "postgresql",
          params: { 1: "123", 2: "45.67" },
          tabWidth: 0,
          useTabs: false,
        }
      )}`
    )
  })

  test("should format SQL query with boolean parameters", () => {
    const mockQuery: CompiledQuery<unknown> = {
      parameters: [true, false],
      query: { kind: "RawNode", parameters: [], sqlFragments: [] },
      queryId: { queryId: "test" },
      sql: "SELECT * FROM table WHERE active = $1 AND verified = $2",
    }

    const result = formatQuery({ query: mockQuery })

    expect(result).toBe(
      `FORMATTED: SELECT * FROM table WHERE active = $1 AND verified = $2 WITH OPTIONS ${JSON.stringify(
        {
          keywordCase: "upper",
          language: "postgresql",
          params: { 1: "true", 2: "false" },
          tabWidth: 0,
          useTabs: false,
        }
      )}`
    )
  })

  test("should format SQL query with mixed parameter types", () => {
    const mockQuery: CompiledQuery<unknown> = {
      parameters: ["John", 30, true],
      query: { kind: "RawNode", parameters: [], sqlFragments: [] },
      queryId: { queryId: "test" },
      sql: "SELECT * FROM table WHERE name = $1 AND age > $2 AND active = $3",
    }

    const result = formatQuery({ query: mockQuery })

    expect(result).toBe(
      `FORMATTED: SELECT * FROM table WHERE name = $1 AND age > $2 AND active = $3 WITH OPTIONS ${JSON.stringify(
        {
          keywordCase: "upper",
          language: "postgresql",
          params: { 1: "'John'", 2: "30", 3: "true" },
          tabWidth: 0,
          useTabs: false,
        }
      )}`
    )
  })

  test("should handle empty parameters array", () => {
    const mockQuery: CompiledQuery<unknown> = {
      parameters: [],
      query: { kind: "RawNode", parameters: [], sqlFragments: [] },
      queryId: { queryId: "test" },
      sql: "SELECT * FROM table",
    }

    const result = formatQuery({ query: mockQuery })

    expect(result).toBe(
      `FORMATTED: SELECT * FROM table WITH OPTIONS ${JSON.stringify({
        keywordCase: "upper",
        language: "postgresql",
        params: {},
        tabWidth: 0,
        useTabs: false,
      })}`
    )
  })
})
