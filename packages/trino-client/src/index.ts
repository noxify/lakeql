import {
  TrinoClientError,
  TrinoCancellationError,
  TrinoQueryError,
} from "./errors"
import { withRetry } from "./retry"
import type { RetryConfig } from "./retry"
import type {
  GetColumnsProps,
  GetSchemasProps,
  GetTablesProps,
  GetViewsProps,
  QueryProps,
  QueryResult,
  TrinoClientProps,
  TrinoHeaderName,
} from "./types"

export {
  TrinoClientError,
  TrinoCancellationError,
  TrinoQueryError,
  TrinoTimeoutError,
} from "./errors"
export type { RetryConfig } from "./retry"
export { State, TrinoHeader } from "./types"
export type {
  Auth,
  BasicAuth,
  BearerAuth,
  ClientTypeSignature,
  ClientTypeSignatureParameter,
  Column,
  ErrorLocation,
  FailureInfo,
  GetColumnsProps,
  GetSchemasProps,
  GetTablesProps,
  GetViewsProps,
  QueryError,
  QueryProps,
  QueryResult,
  StageStats,
  Stats,
  TrinoClientProps,
  TrinoHeaderName,
  Warning,
} from "./types"

/**
 * A client for interacting with a Trino cluster via its REST API.
 *
 * Uses native `fetch` — no external HTTP dependencies. Supports automatic
 * pagination, streaming via async generators, query cancellation, and
 * configurable retry with exponential backoff.
 *
 * @example
 * ```ts
 * const client = new TrinoClient({
 *   host: "http://localhost",
 *   port: 8080,
 *   auth: { type: "basic", username: "user", password: "secret" },
 *   catalog: "hive",
 * })
 * const rows = await client.query({ sql: "SELECT 1" })
 * ```
 */
export class TrinoClient {
  host: string
  port: number
  headers: Headers
  private readonly retryConfig: RetryConfig
  private readonly defaultTimeout: number | undefined
  private readonly activeQueries = new Set<string>()

  /**
   * Creates a new TrinoClient instance.
   */
  constructor({
    host,
    port,
    auth,
    catalog,
    schema,
    source,
    retry,
    timeout,
  }: TrinoClientProps) {
    this.host = host
    this.port = port
    this.retryConfig = retry ?? {}
    this.defaultTimeout = timeout
    this.headers = new Headers()

    if (auth.type === "bearer") {
      this.setRawHeader("Authorization", `Bearer ${auth.token}`)
    } else {
      this.setRawHeader(
        "Authorization",
        `Basic ${btoa(`${auth.username}:${auth.password}`)}`
      )
    }

    this.setHeader("X-Trino-Source", source ?? "nodejs")
    this.setHeader("X-Trino-Catalog", catalog)

    if (schema) {
      this.setHeader("X-Trino-Schema", schema)
    }
  }

  /** Sets a well-known Trino request header. */
  setHeader(key: TrinoHeaderName, value: string) {
    this.headers.set(key, value)
  }

  /** Sets an arbitrary request header without key validation. */
  setRawHeader(key: string, value: string) {
    this.headers.set(key, value)
  }

  /** Returns all currently configured request headers as a plain object. */
  getHeaders(): Record<string, string> {
    return Object.fromEntries(this.headers.entries())
  }

  /**
   * Executes a SQL statement and collects all result pages into a single array.
   * Automatically follows `nextUri` pagination until the result set is complete.
   */
  async query<T>({
    sql,
    impersonateAs,
    signal,
    transform,
  }: QueryProps<T>): Promise<T[]> {
    const result = await this.runStatement<T>(sql, impersonateAs, signal)
    this.activeQueries.add(result.id)

    try {
      const columns = result.columns ?? []
      const allData: T[] = transform
        ? (result.data ?? []).map((row) => transform(row as unknown[], columns))
        : (result.data ?? [])

      let { nextUri } = result
      while (nextUri) {
        TrinoClient.checkAborted(signal, result.id)
        // eslint-disable-next-line no-await-in-loop
        const next = await this.fetchNext<T>(nextUri, signal)
        if (next.data) {
          if (transform) {
            allData.push(
              ...next.data.map((row) =>
                transform(row as unknown[], next.columns ?? columns)
              )
            )
          } else {
            allData.push(...next.data)
          }
        }
        ;({ nextUri } = next)
      }

      return allData
    } finally {
      this.activeQueries.delete(result.id)
    }
  }

  /**
   * Executes a SQL statement and returns an async generator that yields rows
   * one at a time as pages are fetched.
   */
  async stream<T>({
    sql,
    impersonateAs,
    signal,
    transform,
  }: QueryProps<T>): Promise<AsyncGenerator<T>> {
    const result = await this.runStatement<T>(sql, impersonateAs, signal)
    const columns = result.columns ?? []
    const initialData: T[] = transform
      ? (result.data ?? []).map((row) => transform(row as unknown[], columns))
      : (result.data ?? [])
    let { nextUri } = result

    const fetchNext = this.fetchNext.bind(this)
    const queryId = result.id

    async function* streamRows() {
      for (const row of initialData) {
        yield row
      }

      while (nextUri) {
        TrinoClient.checkAborted(signal, queryId)
        // eslint-disable-next-line no-await-in-loop
        const next = await fetchNext<T>(nextUri, signal)
        const nextColumns = next.columns ?? columns
        if (next.data) {
          for (const row of next.data) {
            yield transform ? transform(row as unknown[], nextColumns) : row
          }
        }
        ;({ nextUri } = next)
      }
    }

    return streamRows()
  }

  /**
   * Cancels a running query via its query ID.
   */
  async cancelQuery(queryId: string): Promise<void> {
    const response = await fetch(
      `${this.host}:${this.port}/v1/query/${queryId}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      }
    )

    if (!response.ok && response.status !== 404) {
      throw new TrinoClientError(
        `Failed to cancel query ${queryId}: ${response.status} ${response.statusText}`,
        response.status
      )
    }

    this.activeQueries.delete(queryId)
  }

  /**
   * Cancels all currently active queries tracked by this client.
   */
  async cancelAllQueries(): Promise<void> {
    const ids = [...this.activeQueries]
    await Promise.allSettled(ids.map((id) => this.cancelQuery(id)))
  }

  /**
   * Returns the IDs of all currently active (in-flight) queries.
   */
  getActiveQueries(): string[] {
    return [...this.activeQueries]
  }

  /** Lists all schemas in the given catalog. */
  async schemas({ catalog }: GetSchemasProps): Promise<string[]> {
    const rows = await this.query<string[]>({
      sql: `SHOW SCHEMAS from ${catalog}`,
    })
    return rows.flat()
  }

  /** Lists all base tables in the given catalog and schema. */
  async tables({ catalog, schema }: GetTablesProps): Promise<string[]> {
    const rows = await this.query<string[]>({
      sql: `SELECT table_name from ${catalog}.information_schema.tables WHERE table_type = 'BASE TABLE' and table_schema='${schema}'`,
    })
    return rows.flat()
  }

  /** Lists all views in the given catalog and schema. */
  async views({ catalog, schema }: GetViewsProps): Promise<string[]> {
    const rows = await this.query<string[]>({
      sql: `SELECT table_name from ${catalog}.information_schema.tables WHERE table_type = 'VIEW' and table_schema='${schema}'`,
    })
    return rows.flat()
  }

  /** Lists all columns for the given table. */
  async columns({
    catalog,
    schema,
    table,
  }: GetColumnsProps): Promise<
    [name: string, type: string, extra: string, description: string][]
  > {
    return this.query<
      [name: string, type: string, extra: string, description: string]
    >({
      sql: `SHOW COLUMNS from ${catalog}.${schema}.${table}`,
    })
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async runStatement<T>(
    sql: string,
    impersonateAs?: string,
    signal?: AbortSignal
  ): Promise<QueryResult<T>> {
    TrinoClient.checkAborted(signal)

    return withRetry(async () => {
      let response: Response
      try {
        response = await fetch(`${this.host}:${this.port}/v1/statement`, {
          method: "POST",
          body: sql,
          headers: {
            ...this.getHeaders(),
            ...(impersonateAs ? { "X-Trino-User": impersonateAs } : {}),
          },
          signal: this.createSignal(signal),
        })
      } catch (error) {
        // Convert abort errors to TrinoCancellationError
        if (signal?.aborted) {
          throw new TrinoCancellationError(signal.reason ?? "Query was aborted")
        }
        throw error
      }

      if (!response.ok) {
        throw new TrinoClientError(
          `${response.status} - ${response.statusText}`,
          response.status
        )
      }

      const data = (await response.json()) as QueryResult<T>

      if (data.error) {
        throw new TrinoQueryError(
          data.error.message,
          data.id,
          data.error.errorCode,
          data.error.errorName,
          data.error.errorType
        )
      }

      return data
    }, this.retryConfig)
  }

  private async fetchNext<T>(
    nextUri: string,
    signal?: AbortSignal
  ): Promise<QueryResult<T>> {
    return withRetry(async () => {
      let response: Response
      try {
        response = await fetch(nextUri, {
          method: "GET",
          headers: this.getHeaders(),
          signal: this.createSignal(signal),
        })
      } catch (error) {
        // Convert abort errors to TrinoCancellationError
        if (signal?.aborted) {
          throw new TrinoCancellationError(signal.reason ?? "Query was aborted")
        }
        throw error
      }

      if (!response.ok) {
        throw new TrinoClientError(
          `${response.status} - ${response.statusText}`,
          response.status
        )
      }

      const data = (await response.json()) as QueryResult<T>

      if (data.error) {
        throw new TrinoQueryError(
          data.error.message,
          data.id,
          data.error.errorCode,
          data.error.errorName,
          data.error.errorType
        )
      }

      return data
    }, this.retryConfig)
  }

  private static checkAborted(signal?: AbortSignal, queryId?: string): void {
    if (signal?.aborted) {
      throw new TrinoCancellationError(
        signal.reason ?? "Query was aborted",
        queryId
      )
    }
  }

  private createSignal(externalSignal?: AbortSignal): AbortSignal | undefined {
    if (!this.defaultTimeout && !externalSignal) {
      return undefined
    }

    if (this.defaultTimeout && externalSignal) {
      return AbortSignal.any([
        AbortSignal.timeout(this.defaultTimeout),
        externalSignal,
      ])
    }

    if (this.defaultTimeout) {
      return AbortSignal.timeout(this.defaultTimeout)
    }

    return externalSignal
  }
}
