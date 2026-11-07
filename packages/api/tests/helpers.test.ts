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

import { DataSourceError } from "@lakeql/datasource"
import { AuthScopeFailureType } from "@pothos/plugin-scope-auth"
import { GraphQLError } from "graphql"

import {
  createPermission,
  handleErrorResponse,
  throwFirstError,
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
  it("maps auth category to PERMISSION_DENIED with status 403", () => {
    const error = new DataSourceError("denied", "trino", "warehouse", "auth")

    const err = getGraphQLError(() => handleErrorResponse(error))
    expect(err).toBeInstanceOf(GraphQLError)
    expect(err.message).toBe("denied")
    expect(err.extensions.code).toBe("PERMISSION_DENIED")
    expect((err.extensions.http as { status: number }).status).toBe(403)
  })

  it("maps query category to QUERY_ERROR with status 400", () => {
    const error = new DataSourceError("bad sql", "trino", "warehouse", "query")

    const err = getGraphQLError(() => handleErrorResponse(error))
    expect(err.extensions.code).toBe("QUERY_ERROR")
    expect((err.extensions.http as { status: number }).status).toBe(400)
  })

  it("maps timeout category to TIMEOUT with status 504", () => {
    const error = new DataSourceError(
      "timed out",
      "trino",
      "warehouse",
      "timeout"
    )

    const err = getGraphQLError(() => handleErrorResponse(error))
    expect(err.extensions.code).toBe("TIMEOUT")
    expect((err.extensions.http as { status: number }).status).toBe(504)
  })

  it("maps network category to NETWORK_ERROR with status 502", () => {
    const error = new DataSourceError(
      "unreachable",
      "trino",
      "warehouse",
      "network"
    )

    const err = getGraphQLError(() => handleErrorResponse(error))
    expect(err.extensions.code).toBe("NETWORK_ERROR")
    expect((err.extensions.http as { status: number }).status).toBe(502)
  })

  it("propagates adapter and dataSource in the extensions", () => {
    const error = new DataSourceError("denied", "trino", "warehouse", "auth")

    const err = getGraphQLError(() => handleErrorResponse(error))
    expect(err.extensions.adapter).toBe("trino")
    expect(err.extensions.dataSource).toBe("warehouse")
  })

  it("preserves the DataSourceError as originalError", () => {
    // So the error-logging plugin can read category/dataSource/adapter back.
    const error = new DataSourceError("denied", "trino", "warehouse", "auth")

    const err = getGraphQLError(() => handleErrorResponse(error))
    expect(err.originalError).toBe(error)
  })

  it("wraps non-DataSourceError as UNKNOWN with status 500", () => {
    const err = getGraphQLError(() => handleErrorResponse(new Error("boom")))
    expect(err.message).toBe("boom")
    expect(err.extensions.code).toBe("UNKNOWN")
    expect((err.extensions.http as { status: number }).status).toBe(500)
  })

  it("uses a generic message for non-Error throwables", () => {
    const err = getGraphQLError(() => handleErrorResponse("some string"))
    expect(err.message).toBe("Unknown exception")
    expect(err.extensions.code).toBe("UNKNOWN")
    expect((err.extensions.http as { status: number }).status).toBe(500)
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

describe(createPermission, () => {
  it("builds a permission entry with dataSource and rules", () => {
    const result = createPermission("warehouse", (rule) => [
      rule({ schema: "sales", tables: ["orders", "customers"] }),
    ])

    expect(result).toStrictEqual({
      dataSource: "warehouse",
      rules: [{ schema: "sales", tables: ["orders", "customers"] }],
    })
  })

  it("passes the rule identity helper through unchanged", () => {
    const result = createPermission("warehouse", (rule) => [
      rule({ catalog: "hive", schema: "finance", tables: ["*"] }),
    ])

    expect(result.rules).toStrictEqual([
      { catalog: "hive", schema: "finance", tables: ["*"] },
    ])
  })

  it("supports multiple rules", () => {
    const result = createPermission("lake", (rule) => [
      rule({ schema: "a", tables: ["t1"] }),
      rule({ schema: "b", tables: ["*"] }),
    ])

    expect(result.rules).toHaveLength(2)
    expect(result.dataSource).toBe("lake")
  })

  it("supports an empty rules list", () => {
    const result = createPermission("empty", () => [])

    expect(result).toStrictEqual({ dataSource: "empty", rules: [] })
  })
})
