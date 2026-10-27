import { describe, expect, it } from "vitest"

import {
  AuthenticationError,
  CancellationError,
  DataSourceError,
  DataSourceValidationError,
  NetworkError,
  QueryExecutionError,
  TimeoutError,
  UnsupportedOperationError,
} from "../../src/errors/index"

describe("DataSourceError hierarchy", () => {
  describe("DataSourceError base class", () => {
    it("exposes adapter, dataSource, category, and message", () => {
      const error = new DataSourceError("base error", "trino", "my-ds", "query")
      expect(error.adapter).toBe("trino")
      expect(error.dataSource).toBe("my-ds")
      expect(error.category).toBe("query")
      expect(error.message).toBe("base error")
      expect(error.name).toBe("DataSourceError")
    })

    it("is an instance of Error", () => {
      const error = new DataSourceError("msg", "trino", "ds", "auth")
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(DataSourceError)
    })

    it("preserves cause via Error.cause", () => {
      const cause = new Error("root")
      const error = new DataSourceError("msg", "trino", "ds", "network", {
        cause,
      })
      expect(error.cause).toBe(cause)
    })

    it("cause is undefined when not provided", () => {
      const error = new DataSourceError("msg", "trino", "ds", "timeout")
      expect(error.cause).toBeUndefined()
    })
  })

  describe("QueryExecutionError subclass", () => {
    it("fixes category to 'query'", () => {
      const error = new QueryExecutionError("query failed", "trino", "my-ds")
      expect(error.category).toBe("query")
      expect(error.adapter).toBe("trino")
      expect(error.dataSource).toBe("my-ds")
      expect(error.message).toBe("query failed")
      expect(error.name).toBe("QueryExecutionError")
    })

    it("is an instance of DataSourceError and Error", () => {
      const error = new QueryExecutionError("fail", "trino", "ds")
      expect(error).toBeInstanceOf(QueryExecutionError)
      expect(error).toBeInstanceOf(DataSourceError)
      expect(error).toBeInstanceOf(Error)
    })

    it("preserves cause identity", () => {
      const cause = new TypeError("bad type")
      const error = new QueryExecutionError("fail", "trino", "ds", { cause })
      expect(error.cause).toBe(cause)
    })
  })

  describe("AuthenticationError subclass", () => {
    it("fixes category to 'auth'", () => {
      const error = new AuthenticationError("auth failed", "fabric", "prod-ds")
      expect(error.category).toBe("auth")
      expect(error.adapter).toBe("fabric")
      expect(error.dataSource).toBe("prod-ds")
      expect(error.message).toBe("auth failed")
      expect(error.name).toBe("AuthenticationError")
    })

    it("is an instance of DataSourceError and Error", () => {
      const error = new AuthenticationError("fail", "fabric", "ds")
      expect(error).toBeInstanceOf(AuthenticationError)
      expect(error).toBeInstanceOf(DataSourceError)
      expect(error).toBeInstanceOf(Error)
    })

    it("preserves cause identity", () => {
      const cause = { code: 401 }
      const error = new AuthenticationError("fail", "fabric", "ds", { cause })
      expect(error.cause).toBe(cause)
    })
  })

  describe("NetworkError subclass", () => {
    it("fixes category to 'network'", () => {
      const error = new NetworkError("connection refused", "trino", "staging")
      expect(error.category).toBe("network")
      expect(error.adapter).toBe("trino")
      expect(error.dataSource).toBe("staging")
      expect(error.message).toBe("connection refused")
      expect(error.name).toBe("NetworkError")
    })

    it("is an instance of DataSourceError and Error", () => {
      const error = new NetworkError("fail", "trino", "ds")
      expect(error).toBeInstanceOf(NetworkError)
      expect(error).toBeInstanceOf(DataSourceError)
      expect(error).toBeInstanceOf(Error)
    })

    it("preserves cause identity", () => {
      const cause = new Error("ECONNREFUSED")
      const error = new NetworkError("fail", "trino", "ds", { cause })
      expect(error.cause).toBe(cause)
    })
  })

  describe("TimeoutError subclass", () => {
    it("fixes category to 'timeout'", () => {
      const error = new TimeoutError("timed out", "fabric", "slow-ds")
      expect(error.category).toBe("timeout")
      expect(error.adapter).toBe("fabric")
      expect(error.dataSource).toBe("slow-ds")
      expect(error.message).toBe("timed out")
      expect(error.name).toBe("TimeoutError")
    })

    it("is an instance of DataSourceError and Error", () => {
      const error = new TimeoutError("fail", "fabric", "ds")
      expect(error).toBeInstanceOf(TimeoutError)
      expect(error).toBeInstanceOf(DataSourceError)
      expect(error).toBeInstanceOf(Error)
    })

    it("preserves cause identity", () => {
      const cause = new Error("deadline exceeded")
      const error = new TimeoutError("fail", "fabric", "ds", { cause })
      expect(error.cause).toBe(cause)
    })
  })

  describe("CancellationError subclass", () => {
    it("fixes category to 'cancelled'", () => {
      const error = new CancellationError("cancelled", "trino", "my-ds")
      expect(error.category).toBe("cancelled")
      expect(error.adapter).toBe("trino")
      expect(error.dataSource).toBe("my-ds")
      expect(error.message).toBe("cancelled")
      expect(error.name).toBe("CancellationError")
    })

    it("is an instance of DataSourceError and Error", () => {
      const error = new CancellationError("fail", "trino", "ds")
      expect(error).toBeInstanceOf(CancellationError)
      expect(error).toBeInstanceOf(DataSourceError)
      expect(error).toBeInstanceOf(Error)
    })

    it("preserves cause identity", () => {
      const cause = new DOMException("aborted", "AbortError")
      const error = new CancellationError("fail", "trino", "ds", { cause })
      expect(error.cause).toBe(cause)
    })
  })

  describe("UnsupportedOperationError subclass", () => {
    it("fixes category to 'unsupported' and exposes operation", () => {
      const error = new UnsupportedOperationError(
        "writes not supported",
        "fabric",
        "read-only-ds",
        "write"
      )
      expect(error.category).toBe("unsupported")
      expect(error.operation).toBe("write")
      expect(error.adapter).toBe("fabric")
      expect(error.dataSource).toBe("read-only-ds")
      expect(error.message).toBe("writes not supported")
    })

    it("has correct error name", () => {
      const error = new UnsupportedOperationError(
        "writes not supported",
        "fabric",
        "read-only-ds",
        "write"
      )
      expect(error.name).toBe("UnsupportedOperationError")
    })

    it("is an instance of DataSourceError and Error", () => {
      const error = new UnsupportedOperationError(
        "fail",
        "trino",
        "ds",
        "write"
      )
      expect(error).toBeInstanceOf(UnsupportedOperationError)
      expect(error).toBeInstanceOf(DataSourceError)
      expect(error).toBeInstanceOf(Error)
    })

    it("preserves cause identity", () => {
      const cause = new Error("underlying")
      const error = new UnsupportedOperationError(
        "fail",
        "trino",
        "ds",
        "write",
        { cause }
      )
      expect(error.cause).toBe(cause)
    })

    it("accepts arbitrary operation names", () => {
      const error = new UnsupportedOperationError(
        "not supported",
        "custom-db",
        "ds",
        "stream"
      )
      expect(error.operation).toBe("stream")
    })
  })

  describe("DataSourceValidationError separation", () => {
    it("is not an instance of DataSourceError", () => {
      const error = new DataSourceValidationError("invalid page", {
        field: "page",
        value: -1,
      })
      expect(error).not.toBeInstanceOf(DataSourceError)
    })

    it("is an instance of Error", () => {
      const error = new DataSourceValidationError("invalid")
      expect(error).toBeInstanceOf(Error)
    })

    it("does not have adapter, dataSource, or category properties", () => {
      const error = new DataSourceValidationError("invalid")
      expect("adapter" in error).toBeFalsy()
      expect("dataSource" in error).toBeFalsy()
      expect("category" in error).toBeFalsy()
    })
  })

  describe("Error.cause contract", () => {
    it("preserves the provided cause on the constructed error", () => {
      const cause = new Error("root failure")
      const error = new DataSourceError(
        "operation failed",
        "trino",
        "my-ds",
        "query",
        { cause }
      )
      expect(error.cause).toBe(cause)
    })
  })

  describe("cause identity guard", () => {
    it("construction succeeds with an Error cause", () => {
      const cause = new Error("root cause")
      const error = new DataSourceError("msg", "trino", "ds", "query", {
        cause,
      })
      expect(error.cause).toBe(cause)
    })

    it("construction succeeds with a non-Error cause", () => {
      const cause = "string cause"
      const error = new DataSourceError("msg", "trino", "ds", "query", {
        cause,
      })
      expect(error.cause).toBe(cause)
    })

    it("construction succeeds with null cause", () => {
      const cause = null
      const error = new DataSourceError("msg", "trino", "ds", "query", {
        cause,
      })
      expect(error.cause).toBeNull()
    })

    it("construction succeeds with zero cause", () => {
      const cause = 0
      const error = new DataSourceError("msg", "trino", "ds", "query", {
        cause,
      })
      expect(error.cause).toBe(0)
    })

    it("cause identity holds across all subclasses", () => {
      const cause = new RangeError("out of range")

      const errors = [
        new QueryExecutionError("msg", "a", "ds", { cause }),
        new AuthenticationError("msg", "a", "ds", { cause }),
        new NetworkError("msg", "a", "ds", { cause }),
        new TimeoutError("msg", "a", "ds", { cause }),
        new CancellationError("msg", "a", "ds", { cause }),
        new UnsupportedOperationError("msg", "a", "ds", "op", { cause }),
      ]

      for (const error of errors) {
        expect(error.cause).toBe(cause)
      }
    })
  })

  describe("instanceof cross-checks", () => {
    it("subclasses are not instances of each other", () => {
      const query = new QueryExecutionError("msg", "trino", "ds")
      const auth = new AuthenticationError("msg", "trino", "ds")
      const network = new NetworkError("msg", "trino", "ds")

      expect(query).not.toBeInstanceOf(AuthenticationError)
      expect(query).not.toBeInstanceOf(NetworkError)
      expect(auth).not.toBeInstanceOf(QueryExecutionError)
      expect(auth).not.toBeInstanceOf(NetworkError)
      expect(network).not.toBeInstanceOf(QueryExecutionError)
    })

    it("more subclass cross-checks", () => {
      const network = new NetworkError("msg", "trino", "ds")
      expect(network).not.toBeInstanceOf(AuthenticationError)
    })

    it("DataSourceValidationError is not an instance of DataSourceError", () => {
      const validation = new DataSourceValidationError("invalid")

      expect(validation).not.toBeInstanceOf(DataSourceError)
      expect(validation).not.toBeInstanceOf(QueryExecutionError)
      expect(validation).not.toBeInstanceOf(AuthenticationError)
      expect(validation).not.toBeInstanceOf(NetworkError)
      expect(validation).not.toBeInstanceOf(TimeoutError)
    })

    it("DataSourceValidationError is not an instance of any category subclass", () => {
      const validation = new DataSourceValidationError("invalid")

      expect(validation).not.toBeInstanceOf(CancellationError)
      expect(validation).not.toBeInstanceOf(UnsupportedOperationError)
    })
  })
})
