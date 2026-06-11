// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable vitest/prefer-import-in-mock
// oxlint-disable import/first
import { describe, expect, it, vi } from "vitest"

vi.mock("../src/env", () => ({
  env: {},
}))

vi.mock("@lakeql/logger/console", () => ({
  error: vi.fn(),
}))

import { AuthScopeFailureType } from "@pothos/plugin-scope-auth"
import { GraphQLError } from "graphql"

import {
  calculatePageInfoData,
  createPermission,
  handleErrorResponse,
  throwFirstError,
  transformTrinoResponse,
} from "../src/helpers"

function getGraphQLError(fn: () => void): GraphQLError {
  let caught: unknown
  try {
    fn()
  } catch (error) {
    caught = error
  }
  return caught as GraphQLError
}

describe(handleErrorResponse, () => {
  it("throws SYNTAX_ERROR with status 400 for errorCode 1", () => {
    expect(() =>
      handleErrorResponse({ errorMessage: { errorCode: 1 } })
    ).toThrow(GraphQLError)

    const err = getGraphQLError(() =>
      handleErrorResponse({ errorMessage: { errorCode: 1 } })
    )
    expect(err.message).toBe("Invalid GraphQL query")
    expect(err.extensions.code).toBe("SYNTAX_ERROR")
    expect((err.extensions.http as { status: number }).status).toBe(400)
  })

  it("throws PERMISSION_DENIED with status 403 for errorCode 4", () => {
    expect(() =>
      handleErrorResponse({ errorMessage: { errorCode: 4 } })
    ).toThrow(GraphQLError)

    const err = getGraphQLError(() =>
      handleErrorResponse({ errorMessage: { errorCode: 4 } })
    )
    expect(err.message).toBe("Access denied")
    expect(err.extensions.code).toBe("PERMISSION_DENIED")
    expect((err.extensions.http as { status: number }).status).toBe(403)
  })

  it("throws UNKNOWN with status 500 for errorCode 100", () => {
    expect(() =>
      handleErrorResponse({ errorMessage: { errorCode: 100 } })
    ).toThrow(GraphQLError)

    const err = getGraphQLError(() =>
      handleErrorResponse({ errorMessage: { errorCode: 100 } })
    )
    expect(err.message).toBe("Unknown exception")
    expect(err.extensions.code).toBe("UNKNOWN")
    expect((err.extensions.http as { status: number }).status).toBe(500)
  })

  it("throws VALIDATION_FAILED with status 400 for errorCode 200", () => {
    expect(() =>
      handleErrorResponse({ errorMessage: { errorCode: 200 } })
    ).toThrow(GraphQLError)

    const err = getGraphQLError(() =>
      handleErrorResponse({ errorMessage: { errorCode: 200 } })
    )
    expect(err.message).toBe("Validation failed")
    expect(err.extensions.code).toBe("VALIDATION_FAILED")
    expect((err.extensions.http as { status: number }).status).toBe(400)
  })

  it("uses provided message and code for unknown errorCode", () => {
    expect(() =>
      handleErrorResponse({
        errorMessage: {
          errorCode: 999,
          message: "Custom error",
          code: "CUSTOM_CODE",
        },
      })
    ).toThrow(GraphQLError)

    const err = getGraphQLError(() =>
      handleErrorResponse({
        errorMessage: {
          errorCode: 999,
          message: "Custom error",
          code: "CUSTOM_CODE",
        },
      })
    )
    expect(err.message).toBe("Custom error")
    expect(err.extensions.code).toBe("CUSTOM_CODE")
    expect((err.extensions.http as { status: number }).status).toBe(400)
  })

  it("includes additionalInformation in extensions", () => {
    const additionalInfo = [{ path: ["field"], message: "required" }]

    expect(() =>
      handleErrorResponse({
        errorMessage: {
          errorCode: 200,
          additionalInformation: additionalInfo,
        },
      })
    ).toThrow(GraphQLError)

    const err = getGraphQLError(() =>
      handleErrorResponse({
        errorMessage: {
          errorCode: 200,
          additionalInformation: additionalInfo,
        },
      })
    )
    expect(err.extensions.additionalInformation).toStrictEqual(additionalInfo)
  })
})

describe(throwFirstError, () => {
  it("re-throws the error when failure has an error property", () => {
    const originalError = new Error("original error")
    const failure = {
      kind: AuthScopeFailureType.AuthScope as const,
      scope: "test",
      parameter: "test",
      error: originalError,
    }

    expect(() => throwFirstError(failure)).toThrow(originalError)
  })

  it("throws Permission denied with 403 for AnyAuthScopes kind", () => {
    const failure = {
      kind: AuthScopeFailureType.AnyAuthScopes as const,
      failures: [] as never[],
    }

    expect(() => throwFirstError(failure)).toThrow(GraphQLError)

    const err = getGraphQLError(() => throwFirstError(failure))
    expect(err.message).toBe("Permission denied")
    expect(err.extensions.code).toBe("PERMISSION_DENIED")
    expect((err.extensions.http as { status: number }).status).toBe(403)
  })

  it("throws Permission denied with 403 for AllAuthScopes kind", () => {
    const failure = {
      kind: AuthScopeFailureType.AllAuthScopes as const,
      failures: [] as never[],
    }

    expect(() => throwFirstError(failure)).toThrow(GraphQLError)

    const err = getGraphQLError(() => throwFirstError(failure))
    expect(err.message).toBe("Permission denied")
    expect(err.extensions.code).toBe("PERMISSION_DENIED")
    expect((err.extensions.http as { status: number }).status).toBe(403)
  })
})

describe(calculatePageInfoData, () => {
  it("returns correct data for first page", () => {
    const result = calculatePageInfoData({
      totalCount: 25,
      perPage: 10,
      page: 1,
    })

    expect(result).toMatchObject({
      currentPage: 1,
      hasPrevious: false,
      previousPage: null,
      hasNext: true,
      nextPage: 2,
      maxPages: 3,
      totalCount: 25,
    })
  })

  it("returns correct data for a middle page", () => {
    const result = calculatePageInfoData({
      totalCount: 30,
      perPage: 10,
      page: 2,
    })

    expect(result).toMatchObject({
      currentPage: 2,
      hasPrevious: true,
      previousPage: 1,
      hasNext: true,
      nextPage: 3,
      maxPages: 3,
    })
  })

  it("returns correct data for last page", () => {
    const result = calculatePageInfoData({
      totalCount: 30,
      perPage: 10,
      page: 3,
    })

    expect(result).toMatchObject({
      currentPage: 3,
      hasPrevious: true,
      previousPage: 2,
      hasNext: false,
      nextPage: null,
      maxPages: 3,
    })
  })

  it("handles zero totalCount", () => {
    const result = calculatePageInfoData({
      totalCount: 0,
      perPage: 10,
      page: 1,
    })

    expect(result).toMatchObject({
      currentPage: 1,
      maxPages: 0,
      hasNext: false,
      nextPage: null,
      hasPrevious: false,
      previousPage: null,
    })
  })

  it("defaults to page 1 when page is not provided", () => {
    const result = calculatePageInfoData({
      totalCount: 20,
      perPage: 10,
    })

    expect(result.currentPage).toBe(1)
  })

  it("returns limit and offset", () => {
    const result = calculatePageInfoData({
      totalCount: 30,
      perPage: 10,
      page: 2,
    })

    expect(result.limit).toBe(10)
    expect(result.offset).toBe(10)
  })

  it("offset is undefined for first page", () => {
    const result = calculatePageInfoData({
      totalCount: 30,
      perPage: 10,
      page: 1,
    })

    expect(result.offset).toBeUndefined()
  })
})

describe(createPermission, () => {
  it("returns permission object with direct call", () => {
    const result = createPermission("my_catalog", "my_schema", ["table1"])

    expect(result).toStrictEqual({
      catalog: "my_catalog",
      schema: "my_schema",
      tables: ["table1"],
    })
  })

  it("returns a curried function when called with array config", () => {
    const configs = [
      { catalog: "cat1", schema: "sch1", tableName: "tbl1" },
    ] as const

    const factory = createPermission(configs)
    expect(factory).toBeTypeOf("function")

    const result = factory("cat1", "sch1", ["tbl1"])
    expect(result).toStrictEqual({
      catalog: "cat1",
      schema: "sch1",
      tables: ["tbl1"],
    })
  })

  it("throws TypeError when schema is missing in direct call", () => {
    expect(() =>
      (createPermission as (...args: unknown[]) => unknown)(
        "catalog",
        undefined,
        ["table"]
      )
    ).toThrow(TypeError)
  })

  it("throws TypeError when tables is missing in direct call", () => {
    expect(() =>
      (createPermission as (...args: unknown[]) => unknown)(
        "catalog",
        "schema",
        // oxlint-disable-next-line unicorn/no-useless-undefined
        undefined
      )
    ).toThrow(TypeError)
  })
})

describe(transformTrinoResponse, () => {
  const jsonSchema = {
    type: "object" as const,
    properties: {
      name: { type: "string" as const },
      age: { type: "number" as const },
    },
  }

  it("extracts total_count from first element of first row", () => {
    const response = [[5, "Alice", 30]] as [number, ...unknown[]][]

    const result = transformTrinoResponse({
      response,
      selectFields: ["name", "age"],
      jsonSchema,
    })

    expect(result.total_count).toBe(5)
  })

  it("maps fields using selectFields", () => {
    const response = [[2, "Bob", 25]] as [number, ...unknown[]][]

    const result = transformTrinoResponse({
      response,
      selectFields: ["name", "age"],
      jsonSchema,
    })

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      name: "Bob",
      age: 25,
    })
  })

  it("transforms multiple rows", () => {
    const response = [
      [3, "Alice", 30],
      [3, "Bob", 25],
      [3, "Charlie", 35],
    ] as [number, ...unknown[]][]

    const result = transformTrinoResponse({
      response,
      selectFields: ["name", "age"],
      jsonSchema,
    })

    expect(result.total_count).toBe(3)
    expect(result.data).toHaveLength(3)
  })

  it("applies transformFields to rename columns", () => {
    const schema = {
      type: "object" as const,
      properties: {
        user_name: { type: "string" as const },
      },
    }

    const response = [[1, "Alice"]] as [number, ...unknown[]][]

    const result = transformTrinoResponse({
      response,
      selectFields: ["name"],
      transformFields: { name: "user_name" },
      jsonSchema: schema,
    })

    expect(result.data[0]).toMatchObject({
      name: "Alice",
    })
  })

  it("returns 0 total_count for empty response", () => {
    const result = transformTrinoResponse({
      response: [],
      selectFields: ["name", "age"],
      jsonSchema,
    })

    expect(result.total_count).toBe(0)
    expect(result.data).toHaveLength(0)
  })
})
