/**
 * TDS client for executing T-SQL queries on Microsoft Fabric SQL endpoints.
 *
 * Uses the `mssql` driver (which wraps `tedious`) with the
 * `azure-active-directory-access-token` authentication mode. Access tokens are
 * obtained from a {@link TokenCredential} resolved from the configured
 * {@link FabricAuth}, or supplied per-query via an on-behalf-of bearer token.
 *
 * @module
 */

import sql from "mssql"

import { FABRIC_TOKEN_SCOPE, resolveCredential } from "./auth"
import type { TokenCredential } from "./auth"
import {
  FabricCancellationError,
  FabricClientError,
  FabricQueryError,
} from "./errors"
import { withRetry } from "./retry"
import type { RetryConfig } from "./retry"
import type { FabricClientProps, QueryProps } from "./types"

const DEFAULT_PORT = 1433
const CONNECT_TIMEOUT_MS = 30_000
const REQUEST_TIMEOUT_MS = 30_000
const POOL_MAX = 5

/**
 * TDS client for Microsoft Fabric SQL endpoints.
 *
 * @example
 * ```ts
 * const client = new FabricClient({
 *   host: "your-endpoint.datawarehouse.fabric.microsoft.com",
 *   port: 1433,
 *   catalog: "my_warehouse",
 *   auth: { type: "bearer", token: "..." },
 * })
 * const rows = await client.query({ sql: "SELECT 1 AS n" })
 * await client.close()
 * ```
 */
export class FabricClient {
  /** Fabric SQL endpoint hostname. */
  readonly host: string
  /** Fabric SQL endpoint port. */
  readonly port: number
  /** Default catalog (database) for queries. */
  readonly catalog: string

  private closed = false
  private pool: sql.ConnectionPool | null = null

  private readonly credential: TokenCredential
  private readonly retryConfig: RetryConfig

  /**
   * @param props - Connection and authentication configuration.
   * @param retryConfig - Optional retry tuning applied to each query.
   */
  constructor(props: FabricClientProps, retryConfig: RetryConfig = {}) {
    this.host = props.host
    this.port = props.port
    this.catalog = props.catalog
    this.credential = resolveCredential(props.auth)
    this.retryConfig = retryConfig
  }

  /**
   * Executes a SQL statement and returns all result rows as keyed records.
   *
   * @template TRow - The shape of each returned row.
   * @param props - Query text, optional signal, and optional bearer token.
   * @returns All rows produced by the query.
   * @throws {@link FabricCancellationError} when the signal is aborted.
   * @throws {@link FabricQueryError} when the server rejects the statement.
   * @throws {@link FabricClientError} on connection or other client failures.
   */
  async query<TRow = Record<string, unknown>>(
    props: QueryProps
  ): Promise<TRow[]> {
    this.assertNotClosed()
    FabricClient.checkAborted(props.signal)

    return withRetry(() => this.executeQuery<TRow>(props), this.retryConfig)
  }

  /**
   * Releases the underlying TDS connection pool.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.pool) {
      const { pool } = this
      this.pool = null
      await pool.close()
    }
  }

  private async executeQuery<TRow>(props: QueryProps): Promise<TRow[]> {
    // A per-query bearer token (OBO) uses a short-lived pool disposed after use;
    // otherwise the shared credential-based pool is reused.
    const oboPool =
      props.bearerToken === undefined
        ? undefined
        : await FabricClient.createPool(this.config(props.bearerToken))

    try {
      const pool = oboPool ?? (await this.getPool())
      const request = pool.request()
      FabricClient.wireCancellation(request, props.signal)

      const result = await request.query<TRow>(props.sql)
      return result.recordset ?? []
    } catch (error: unknown) {
      throw FabricClient.mapError(error, props.signal)
    } finally {
      if (oboPool) {
        await FabricClient.closeQuietly(oboPool)
      }
    }
  }

  private static async closeQuietly(pool: sql.ConnectionPool): Promise<void> {
    try {
      await pool.close()
    } catch {
      // A best-effort close of a per-query pool; failures are non-fatal.
    }
  }

  private async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool?.connected) {
      return this.pool
    }
    const token = await this.acquireToken()
    this.pool = await FabricClient.createPool(this.config(token))
    return this.pool
  }

  private config(token: string): sql.config {
    return {
      server: this.host,
      port: this.port || DEFAULT_PORT,
      database: this.catalog,
      authentication: {
        type: "azure-active-directory-access-token",
        options: { token },
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: CONNECT_TIMEOUT_MS,
        requestTimeout: REQUEST_TIMEOUT_MS,
        enableArithAbort: true,
      },
      pool: {
        max: POOL_MAX,
        min: 0,
        idleTimeoutMillis: 30_000,
      },
    }
  }

  private async acquireToken(): Promise<string> {
    let result: { token: string } | null
    try {
      result = await this.credential.getToken(FABRIC_TOKEN_SCOPE)
    } catch (error) {
      throw new FabricClientError(
        `Failed to acquire access token: ${FabricClient.messageOf(error)}`
      )
    }
    if (!result) {
      throw new FabricClientError(
        "Failed to acquire access token: credential returned null"
      )
    }
    return result.token
  }

  private static async createPool(
    config: sql.config
  ): Promise<sql.ConnectionPool> {
    const pool = new sql.ConnectionPool(config)
    await pool.connect()
    return pool
  }

  private static wireCancellation(
    request: sql.Request,
    signal?: AbortSignal
  ): void {
    if (!signal) {
      return
    }
    const onAbort = (): void => {
      request.cancel()
    }
    signal.addEventListener("abort", onAbort, { once: true })
    request.on("done", () => {
      signal.removeEventListener("abort", onAbort)
    })
  }

  private static mapError(error: unknown, signal?: AbortSignal): Error {
    if (signal?.aborted) {
      return new FabricCancellationError(
        (signal.reason as string | undefined) ?? "Query was cancelled"
      )
    }
    if (
      error instanceof FabricClientError ||
      error instanceof FabricQueryError ||
      error instanceof FabricCancellationError
    ) {
      return error
    }
    if (error instanceof sql.RequestError) {
      return new FabricQueryError(
        `Query execution failed: ${error.message}`,
        error.number ?? 0,
        Number((error as { state?: string | number }).state ?? 0)
      )
    }
    if (error instanceof sql.ConnectionError) {
      return new FabricClientError(`Connection error: ${error.message}`)
    }
    return new FabricClientError(
      `Query failed: ${FabricClient.messageOf(error)}`
    )
  }

  private static messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new FabricClientError("FabricClient is closed")
    }
  }

  private static checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new FabricCancellationError(
        (signal.reason as string | undefined) ?? "Query was aborted"
      )
    }
  }
}
