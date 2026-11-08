import {
  AuthenticationError,
  CancellationError,
  NetworkError,
  QueryExecutionError,
  TimeoutError,
} from "@lakeql/datasource"
import {
  TrinoCancellationError,
  TrinoClientError,
  TrinoQueryError,
  TrinoTimeoutError,
} from "@lakeql/trino-client"
import { describe, expect, it } from "vitest"

import { classifyTrinoError } from "../src/errors"

const DS = "test-datasource"

describe(classifyTrinoError, () => {
  // ── 1. DataSourceError pass-through ──────────────────────

  it("returns an existing DataSourceError unchanged (strict reference identity)", () => {
    const existing = new QueryExecutionError("already classified", "trino", DS)

    expect(classifyTrinoError(existing, DS)).toBe(existing)
  })

  // ── 2. TrinoQueryError → QueryExecutionError ──────────────

  it("classifies TrinoQueryError as QueryExecutionError with errorName and errorType", () => {
    const original = new TrinoQueryError(
      "Table not found",
      "query-123",
      1,
      "TABLE_NOT_FOUND",
      "USER_ERROR"
    )
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(QueryExecutionError)
    expect(result.message).toContain("TABLE_NOT_FOUND")
    expect(result.message).toContain("USER_ERROR")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("TrinoQueryError result has category 'query' and correct dataSource", () => {
    const original = new TrinoQueryError("fail", "q1", 1, "E", "T")
    const result = classifyTrinoError(original, DS)

    expect(result.category).toBe("query")
    expect(result.dataSource).toBe(DS)
  })

  it("appends the Trino message for PERMISSION_DENIED (access-control, SQL-free)", () => {
    const original = new TrinoQueryError(
      "Access Denied: Cannot select from table hive.schema.tbl",
      "q1",
      4,
      "PERMISSION_DENIED",
      "USER_ERROR"
    )
    const result = classifyTrinoError(original, DS)

    expect(result.message).toContain("PERMISSION_DENIED")
    expect(result.message).toContain(
      "Access Denied: Cannot select from table hive.schema.tbl"
    )
  })

  it("omits the Trino message for non-access-control errors (may echo SQL)", () => {
    const original = new TrinoQueryError(
      "line 1:8: mismatched input 'SELCT'",
      "q1",
      1,
      "SYNTAX_ERROR",
      "USER_ERROR"
    )
    const result = classifyTrinoError(original, DS)

    expect(result.message).toContain("SYNTAX_ERROR")
    expect(result.message).not.toContain("SELCT")
  })

  // ── 3–4. TrinoClientError 401/403 → AuthenticationError ──

  it("classifies TrinoClientError 401 as AuthenticationError", () => {
    const original = new TrinoClientError("Unauthorized", 401)
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(AuthenticationError)
    expect(result.category).toBe("auth")
    expect(result.message).toContain("401")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("classifies TrinoClientError 403 as AuthenticationError", () => {
    const original = new TrinoClientError("Forbidden", 403)
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(AuthenticationError)
    expect(result.category).toBe("auth")
    expect(result.message).toContain("403")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  // ── 5–6. TrinoClientError 408/504 → TimeoutError ─────────

  it("classifies TrinoClientError 408 as TimeoutError", () => {
    const original = new TrinoClientError("Request Timeout", 408)
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(TimeoutError)
    expect(result.category).toBe("timeout")
    expect(result.message).toContain("408")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  it("classifies TrinoClientError 504 as TimeoutError", () => {
    const original = new TrinoClientError("Gateway Timeout", 504)
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(TimeoutError)
    expect(result.category).toBe("timeout")
    expect(result.message).toContain("504")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  // ── 7–8. TrinoClientError undefined/0 status → NetworkError

  it("classifies TrinoClientError with undefined status as NetworkError", () => {
    const original = new TrinoClientError("Connection refused")
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(NetworkError)
    expect(result.category).toBe("network")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  it("classifies TrinoClientError with status 0 as NetworkError", () => {
    const original = new TrinoClientError("No response", 0)
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(NetworkError)
    expect(result.category).toBe("network")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  // ── 9. TrinoClientError other status → QueryExecutionError

  it("classifies TrinoClientError 500 as QueryExecutionError with status in message", () => {
    const original = new TrinoClientError("Internal Server Error", 500)
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(QueryExecutionError)
    expect(result.category).toBe("query")
    expect(result.message).toContain("500")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  // ── 10. TrinoTimeoutError → TimeoutError ─────────────────

  it("classifies TrinoTimeoutError as TimeoutError", () => {
    const original = new TrinoTimeoutError("Query timed out", "query-456")
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(TimeoutError)
    expect(result.category).toBe("timeout")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  // ── 11. TrinoCancellationError → CancellationError ───────

  it("classifies TrinoCancellationError as CancellationError", () => {
    const original = new TrinoCancellationError("Query cancelled", "query-789")
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(CancellationError)
    expect(result.category).toBe("cancelled")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  // ── 12. DOMException "TimeoutError" → TimeoutError ───────

  it("classifies DOMException TimeoutError as TimeoutError", () => {
    const original = new DOMException("The operation timed out", "TimeoutError")
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(TimeoutError)
    expect(result.category).toBe("timeout")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  // ── 13. DOMException "AbortError" → CancellationError ────

  it("classifies DOMException AbortError as CancellationError", () => {
    const original = new DOMException("The operation was aborted", "AbortError")
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(CancellationError)
    expect(result.category).toBe("cancelled")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  // ── 14. TypeError → NetworkError ─────────────────────────

  it("classifies TypeError as NetworkError", () => {
    const original = new TypeError("fetch failed")
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(NetworkError)
    expect(result.category).toBe("network")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  // ── 15. Generic Error → QueryExecutionError ──────────────

  it("classifies generic Error as QueryExecutionError with unknown indication", () => {
    const original = new Error("something unexpected")
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(QueryExecutionError)
    expect(result.message).toContain("unknown")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBe(original)
  })

  // ── 16. Non-Error string → QueryExecutionError ───────────

  it("classifies non-Error string as QueryExecutionError without stringifying it", () => {
    const original = "secret-password-leak"
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(QueryExecutionError)
    expect(result.message).toContain("unknown")
    expect(result.message).not.toContain("secret-password-leak")
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })

  // ── 17. Non-Error null → QueryExecutionError ─────────────

  it("classifies null as QueryExecutionError", () => {
    const result = classifyTrinoError(null, DS)

    expect(result).toBeInstanceOf(QueryExecutionError)
    expect(result.message).toContain("unknown")
    expect(result.adapter).toBe("trino")
    expect(result.dataSource).toBe(DS)
    expect(result.cause).toBeNull()
  })

  // ── Credential safety ────────────────────────────────────

  it("does not include credentials or SQL in any classified error message", () => {
    const sensitiveValues = [
      "my-secret-password",
      "Bearer eyJhbGciOi",
      "SELECT * FROM secrets",
      "Authorization: Basic",
    ]

    const errors: unknown[] = [
      new TrinoQueryError("fail", "q1", 1, "GENERIC_ERROR", "USER_ERROR"),
      new TrinoClientError("fail", 401),
      new TrinoClientError("fail", 500),
      new TrinoTimeoutError("fail"),
      new TrinoCancellationError("fail"),
      new TypeError("fail"),
      new Error("fail"),
    ]

    for (const error of errors) {
      const result = classifyTrinoError(error, DS)
      for (const secret of sensitiveValues) {
        expect(result.message).not.toContain(secret)
      }
    }
  })

  // ── DataSourceError subclass pass-through precedence ──

  it("returns DataSourceError subclass unchanged (pass-through before any other branch)", () => {
    const existing = new AuthenticationError("already auth error", "trino", DS)
    const result = classifyTrinoError(existing, DS)

    expect(result).toBe(existing)
    expect(result).toBeInstanceOf(AuthenticationError)
  })

  // ── DOMException with unrecognized name → generic fallback ──

  it("classifies DOMException with unrecognized name as QueryExecutionError", () => {
    const original = new DOMException("something", "DataError")
    const result = classifyTrinoError(original, DS)

    expect(result).toBeInstanceOf(QueryExecutionError)
    expect(result.category).toBe("query")
    expect(result.message).toMatch(/DOMException.*DataError/u)
    expect(result.adapter).toBe("trino")
    expect(result.cause).toBe(original)
  })
})
