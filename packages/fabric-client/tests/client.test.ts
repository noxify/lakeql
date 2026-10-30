import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
// oxlint-disable import/first
// oxlint-disable eslint/no-shadow
// oxlint-disable promise/prefer-await-to-callbacks
// oxlint-disable promise/avoid-new
// oxlint-disable promise/param-names
// oxlint-disable vitest/prefer-import-in-mock
// oxlint-disable vitest/prefer-spy-on
// oxlint-disable unicorn/consistent-function-scoping
//
// This file mocks the `mssql` TDS driver. The mock constructors and shared
// state are created with vi.hoisted so they exist before the hoisted vi.mock
// factory runs; the code-under-test imports therefore follow the vi.mock calls
// by design.

// ─── mssql mock ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const state: {
    lastSql: string | undefined
    lastConfig: unknown
    instances: MockConnectionPoolT[]
    queryImpl: (sql: string) => Promise<{ recordset: unknown[] }>
  } = {
    lastSql: undefined,
    lastConfig: undefined,
    instances: [],
    queryImpl: () => Promise.resolve({ recordset: [] }),
  }

  interface MockRequest {
    cancel: ReturnType<typeof vi.fn>
    on: (event: string, cb: () => void) => MockRequest
    query: <T>(sql: string) => Promise<{ recordset: T[] }>
  }

  interface MockConnectionPool {
    connected: boolean
    request: () => MockRequest
    connect: () => Promise<MockConnectionPool>
    close: ReturnType<typeof vi.fn>
  }

  function createRequest(): MockRequest {
    return {
      cancel: vi.fn<() => void>(),
      on(_event: string, _cb: () => void) {
        return this
      },
      query<T>(sql: string): Promise<{ recordset: T[] }> {
        state.lastSql = sql
        return state.queryImpl(sql) as Promise<{ recordset: T[] }>
      },
    }
  }

  function ConnectionPool(this: MockConnectionPool, config: unknown): void {
    this.connected = false
    this.request = () => createRequest()
    this.connect = vi.fn<() => Promise<MockConnectionPool>>(() => {
      this.connected = true
      return Promise.resolve(this)
    })
    this.close = vi.fn<() => Promise<void>>(() => {
      this.connected = false
      return Promise.resolve()
    })
    state.lastConfig = config
    state.instances.push(this)
  }

  // Two distinct error constructors so the client's `instanceof` checks against
  // `RequestError` and `ConnectionError` resolve to the correct branch. Defined
  // as constructor functions to keep this mock module to a single `class`.
  interface MockRequestError extends Error {
    number: number
    state: number
  }

  function RequestError(
    this: MockRequestError,
    message: string,
    errorNumber: number,
    sqlState: number
  ): void {
    Error.call(this, message)
    this.name = "RequestError"
    this.message = message
    this.number = errorNumber
    this.state = sqlState
  }
  RequestError.prototype = Object.create(Error.prototype)

  function ConnectionError(this: Error, message: string): void {
    Error.call(this, message)
    this.name = "ConnectionError"
    this.message = message
  }
  ConnectionError.prototype = Object.create(Error.prototype)

  type MockConnectionPoolT = MockConnectionPool

  return {
    state,
    ConnectionPool: ConnectionPool as unknown as new (
      config: unknown
    ) => MockConnectionPool,
    RequestError: RequestError as unknown as new (
      message: string,
      errorNumber: number,
      sqlState: number
    ) => MockRequestError,
    ConnectionError: ConnectionError as unknown as new (
      message: string
    ) => Error,
  }
})

const mockState = mocks.state

vi.mock("mssql", () => ({
  default: {
    ConnectionPool: mocks.ConnectionPool,
    RequestError: mocks.RequestError,
    ConnectionError: mocks.ConnectionError,
  },
}))

// Prevent the real ClientSecretCredential from running for oauth2 props.
const azureMock = vi.hoisted(() => {
  function ClientSecretCredential(): void {
    // no fields required
  }
  ClientSecretCredential.prototype.getToken = () =>
    Promise.resolve({ token: "aad-token", expiresOnTimestamp: 0 })
  return { ClientSecretCredential }
})

vi.mock("@azure/identity", () => ({
  ClientSecretCredential: azureMock.ClientSecretCredential,
}))

import {
  FabricCancellationError,
  FabricClient,
  FabricClientError,
  FabricQueryError,
} from "../src"
import type { FabricClientProps } from "../src"

function bearerProps(
  overrides?: Partial<FabricClientProps>
): FabricClientProps {
  return {
    host: "fabric.example.com",
    port: 1433,
    catalog: "my_warehouse",
    auth: { type: "bearer", token: "test-token" },
    ...overrides,
  }
}

function oauthProps(): FabricClientProps {
  return bearerProps({
    auth: {
      type: "oauth2",
      tenantId: "tenant-123",
      clientId: "client-456",
      clientSecret: "secret",
    },
  })
}

describe(FabricClient, () => {
  beforeEach(() => {
    mockState.instances = []
    mockState.lastConfig = undefined
    mockState.lastSql = undefined
    mockState.queryImpl = () => Promise.resolve({ recordset: [] })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("stores host, port, and catalog as readonly properties", () => {
      const client = new FabricClient(bearerProps())
      expect(client.host).toBe("fabric.example.com")
      expect(client.port).toBe(1433)
      expect(client.catalog).toBe("my_warehouse")
    })

    it("accepts oauth2 auth without constructing a pool", () => {
      const client = new FabricClient(oauthProps())
      expect(client.catalog).toBe("my_warehouse")
      expect(mockState.instances).toHaveLength(0)
    })
  })

  describe("query()", () => {
    it("returns the recordset rows", async () => {
      mockState.queryImpl = () =>
        Promise.resolve({ recordset: [{ n: 1 }, { n: 2 }] })
      const client = new FabricClient(bearerProps())

      const rows = await client.query<{ n: number }>({ sql: "SELECT n" })
      expect(rows).toStrictEqual([{ n: 1 }, { n: 2 }])
    })

    it("returns an empty array when the recordset is absent", async () => {
      mockState.queryImpl = () =>
        Promise.resolve({ recordset: undefined } as unknown as {
          recordset: unknown[]
        })
      const client = new FabricClient(bearerProps())

      const rows = await client.query({ sql: "SELECT 1" })
      expect(rows).toStrictEqual([])
    })

    it("passes the SQL text to the request", async () => {
      const client = new FabricClient(bearerProps())
      await client.query({ sql: "SELECT 42 AS answer" })
      expect(mockState.lastSql).toBe("SELECT 42 AS answer")
    })

    it("connects the pool with database set to the catalog", async () => {
      const client = new FabricClient(bearerProps())
      await client.query({ sql: "SELECT 1" })

      expect(mockState.lastConfig).toMatchObject({
        server: "fabric.example.com",
        port: 1433,
        database: "my_warehouse",
      })
    })

    it("authenticates the pool with the bearer token", async () => {
      const client = new FabricClient(bearerProps())
      await client.query({ sql: "SELECT 1" })

      expect(mockState.lastConfig).toMatchObject({
        authentication: {
          type: "azure-active-directory-access-token",
          options: { token: "test-token" },
        },
      })
    })

    it("reuses the pool across queries", async () => {
      const client = new FabricClient(bearerProps())
      await client.query({ sql: "SELECT 1" })
      await client.query({ sql: "SELECT 2" })

      expect(mockState.instances).toHaveLength(1)
    })

    it("uses a per-query bearer token for an OBO pool", async () => {
      const client = new FabricClient(bearerProps())
      await client.query({ sql: "SELECT 1", bearerToken: "obo-token" })

      expect(mockState.lastConfig).toMatchObject({
        authentication: { options: { token: "obo-token" } },
      })
    })

    it("disposes the per-query OBO pool after use", async () => {
      const client = new FabricClient(bearerProps())
      await client.query({ sql: "SELECT 1", bearerToken: "obo-token" })

      const oboPool = mockState.instances.at(-1)
      expect(oboPool?.close).toHaveBeenCalledWith()
    })
  })

  describe("oauth2 token acquisition", () => {
    it("acquires the token from the credential", async () => {
      const client = new FabricClient(oauthProps())
      await client.query({ sql: "SELECT 1" })

      expect(mockState.lastConfig).toMatchObject({
        authentication: { options: { token: "aad-token" } },
      })
    })
  })

  describe("error mapping", () => {
    it("maps a RequestError to FabricQueryError", async () => {
      mockState.queryImpl = () =>
        Promise.reject(new mocks.RequestError("invalid column", 207, 3))
      const client = new FabricClient(bearerProps())

      await expect(client.query({ sql: "SELECT bad" })).rejects.toBeInstanceOf(
        FabricQueryError
      )
    })

    it("carries the error number and state on FabricQueryError", async () => {
      mockState.queryImpl = () =>
        Promise.reject(new mocks.RequestError("invalid column", 207, 3))
      const client = new FabricClient(bearerProps())

      await expect(client.query({ sql: "SELECT bad" })).rejects.toMatchObject({
        errorNumber: 207,
        state: 3,
      })
    })

    it("maps a ConnectionError to FabricClientError", async () => {
      mockState.queryImpl = () =>
        Promise.reject(new mocks.ConnectionError("socket closed"))
      const client = new FabricClient(bearerProps())

      await expect(client.query({ sql: "SELECT 1" })).rejects.toBeInstanceOf(
        FabricClientError
      )
    })

    it("wraps unknown errors as FabricClientError", async () => {
      mockState.queryImpl = () => Promise.reject(new Error("boom"))
      const client = new FabricClient(bearerProps())

      await expect(client.query({ sql: "SELECT 1" })).rejects.toBeInstanceOf(
        FabricClientError
      )
    })
  })

  describe("cancellation", () => {
    it("throws FabricCancellationError when the signal is already aborted", async () => {
      const client = new FabricClient(bearerProps())
      const controller = new AbortController()
      controller.abort("test abort")

      await expect(
        client.query({ sql: "SELECT 1", signal: controller.signal })
      ).rejects.toThrow(FabricCancellationError)
    })

    it("includes the abort reason in the error message", async () => {
      const client = new FabricClient(bearerProps())
      const controller = new AbortController()
      controller.abort("user cancelled")

      await expect(
        client.query({ sql: "SELECT 1", signal: controller.signal })
      ).rejects.toThrow("user cancelled")
    })

    it("reports cancellation when the signal aborts while the query is in flight", async () => {
      const controller = new AbortController()
      mockState.queryImpl = () =>
        new Promise((_, reject) => {
          // Abort while the query is in flight.
          setTimeout(() => {
            controller.abort("aborted mid-flight")
            reject(new Error("request cancelled"))
          }, 0)
        })

      const client = new FabricClient(bearerProps())

      await expect(
        client.query({ sql: "SELECT 1", signal: controller.signal })
      ).rejects.toThrow(FabricCancellationError)
    })
  })

  describe("close()", () => {
    it("resolves without error before any query", async () => {
      const client = new FabricClient(bearerProps())
      await expect(client.close()).resolves.toBeUndefined()
    })

    it("closes the underlying pool", async () => {
      const client = new FabricClient(bearerProps())
      await client.query({ sql: "SELECT 1" })
      await client.close()

      const [pool] = mockState.instances
      expect(pool?.close).toHaveBeenCalledWith()
    })

    it("is idempotent — a second call does not throw", async () => {
      const client = new FabricClient(bearerProps())
      await client.close()
      await expect(client.close()).resolves.toBeUndefined()
    })

    it("query() throws FabricClientError after close", async () => {
      const client = new FabricClient(bearerProps())
      await client.close()
      await expect(client.query({ sql: "SELECT 1" })).rejects.toThrow(
        "FabricClient is closed"
      )
    })
  })
})
