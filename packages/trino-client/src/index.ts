import Bourne from "@hapi/bourne"
import type { OptionsOfTextResponseBody, Response } from "got"
import got from "got"

import type { State } from "./const"

export enum TrinoHeader {
  /**
   * Specifies the session user. If not supplied, the session user is automatically determined via User mapping.
   */
  "X-Trino-User",

  /**
   * Specifies the session’s original user.
   */
  "X-Trino-Original-User",

  /**
   * For reporting purposes, this supplies the name of the software that submitted the query.
   */
  "X-Trino-Source",

  /**
   * The catalog context for query processing. Set by response header X-Trino-Set-Catalog.
   */
  "X-Trino-Catalog",

  /**
   * The schema context for query processing. Set by response header X-Trino-Set-Schema.
   */
  "X-Trino-Schema",

  /**
   * The timezone for query processing. Defaults to the timezone of the Trino cluster, and not the timezone of the client.
   */
  "X-Trino-Time-Zone",

  /**
   * The language to use when processing the query and formatting results, formatted as a Java Locale string, e.g., en-US for US English.
   * The language of the session can be set on a per-query basis using the X-Trino-Language HTTP header.
   */
  "X-Trino-Language",

  /**
   * Supplies a trace token to the Trino engine to help identify log lines that originate with this query request.
   */
  "X-Trino-Trace-Token",

  /**
   * Supplies a comma-separated list of name=value pairs as session properties.
   * When the Trino client run a SET SESSION name=value query, the name=value pair is returned in the X-Set-Trino-Session response header,
   * and added to the client’s list of session properties. If the response header X-Trino-Clear-Session is returned,
   * its value is the name of a session property that is removed from the client’s accumulated list.
   */
  "X-Trino-Session",

  /**
   * Sets the “role” for query processing. A “role” represents a collection of permissions. Set by response header X-Trino-Set-Role. See CREATE ROLE to understand roles.
   */
  "X-Trino-Role",
  /**
   * A comma-separated list of the name=value pairs, where the names are names of previously prepared SQL statements, and the values are keys that identify the executable form of the named prepared statements.
   */
  "X-Trino-Prepared-Statement",
  /**
   * The transaction ID to use for query processing. Set by response header X-Trino-Started-Transaction-Id and cleared by X-Trino-Clear-Transaction-Id.
   */
  "X-Trino-Transaction-Id",

  /**
   * Contains arbitrary information about the client program submitting the query.
   */
  "X-Trino-Client-Info",
  /**
   * A comma-separated list of “tag” strings, used to identify Trino resource groups.
   */
  "X-Trino-Client-Tags",
  /**
   * A comma-separated list of resource=value type assignments. The possible choices of resource are EXECUTION_TIME, CPU_TIME, PEAK_MEMORY and PEAK_TASK_MEMORY. EXECUTION_TIME and CPU_TIME have values specified as airlift Duration strings The format is a double precision number followed by a TimeUnit string, e.g., of s for seconds, m for minutes, h for hours, etc. “PEAK_MEMORY” and “PEAK_TASK_MEMORY” are specified as airlift DataSize strings, whose format is an integer followed by B for bytes; kB for kilobytes; mB for megabytes, gB for gigabytes, etc.
   */
  "X-Trino-Resource-Estimate",

  /**
   * Provides extra credentials to the connector. The header is a name=value string that is saved in the session Identity object. The name and value are only meaningful to the connector.
   */
  "X-Trino-Extra-Credential",
}

export interface QueryResult<T = unknown> {
  id: string
  infoUri: string
  partialCancelUri?: string
  nextUri?: string
  columns?: Column[]
  data?: T[]
  stats: Stats
  warnings: unknown[]
  error?: Error
}

export interface Column {
  name: string
  type: string
  typeSignature: TypeSignature
}

export interface TypeSignature {
  rawType: string
  arguments: Argument[]
}

export interface Argument {
  kind: string
  value: number
}

export interface Stats {
  state: State
  queued: boolean
  scheduled: boolean
  progressPercentage: number
  runningPercentage: number
  nodes: number
  totalSplits: number
  queuedSplits: number
  runningSplits: number
  completedSplits: number
  cpuTimeMillis: number
  wallTimeMillis: number
  queuedTimeMillis: number
  elapsedTimeMillis: number
  processedRows: number
  processedBytes: number
  physicalInputBytes: number
  peakMemoryBytes: number
  spilledBytes: number
  rootStage?: Stage
}

export interface Stage {
  stageId: string
  state: State
  done: boolean
  nodes: number
  totalSplits: number
  queuedSplits: number
  runningSplits: number
  completedSplits: number
  cpuTimeMillis: number
  wallTimeMillis: number
  processedRows: number
  processedBytes: number
  physicalInputBytes: number
  failedTasks: number
  coordinatorOnly: boolean
  subStages: Stage[]
}

export interface Error {
  message: string
  errorCode: number
  errorName: string
  errorType: string
  errorLocation: ErrorLocation
  failureInfo: FailureInfo
}

export interface ErrorLocation {
  lineNumber: number
  columnNumber: number
}

export interface FailureInfo {
  type: string
  message: string
  cause: Cause
  suppressed: unknown[]
  stack: string[]
  errorLocation: ErrorLocation
}

export interface Cause {
  type: string
  suppressed: unknown[]
  stack: string[]
}

interface BaseProps {
  gotOpts?: Omit<
    OptionsOfTextResponseBody,
    "responseType" | "body" | "method" | "resolveBodyOnly" | "headers"
  >
}

interface QueryProps extends BaseProps {
  sql: string
  impersonateAs?: string
}

interface GetSchemasProps extends BaseProps {
  catalog: string
}

interface GetTablesProps extends GetSchemasProps {
  schema: string
}

interface GetViewsProps extends GetSchemasProps {
  schema: string
}

interface GetColumnsProps extends GetTablesProps {
  table: string
}

export interface TrinoClientProps {
  host: string
  port: number
  auth: Auth
  catalog: string
  schema?: string
  source?: string
}

export interface BasicAuth {
  type: "basic"
  username: string
  password: string
}

export interface BearerAuth {
  type: "bearer"
  token: string
}

export type Auth = BasicAuth | BearerAuth

/**
 * A client for interacting with a Trino cluster via its REST API.
 *
 * Supports executing queries (paginated or streamed), and inspecting
 * catalog metadata such as schemas, tables, views, and columns.
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

  /**
   * Creates a new {@link TrinoClient} instance and configures the default
   * request headers based on the provided options.
   *
   * @param params - Client configuration.
   * @param params.host - The Trino coordinator hostname including protocol (e.g. `"http://localhost"`).
   * @param params.port - The port the Trino coordinator listens on.
   * @param params.auth - Authentication credentials — either {@link BasicAuth} or {@link BearerAuth}.
   * @param params.catalog - The default catalog used for all queries.
   * @param params.schema - Optional default schema used for all queries.
   * @param params.source - Optional source identifier sent as `X-Trino-Source`. Defaults to `"nodejs"`.
   */
  constructor({ host, port, auth, catalog, schema, source }: TrinoClientProps) {
    this.host = host
    this.port = port

    this.headers = new Headers()

    if (auth.type === "bearer") {
      this.setRawHeader("Authorization", `Bearer ${auth.token}`)
    } else {
      this.setRawHeader(
        "Authorization",
        `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`
      )
    }

    // set source for the http request
    this.setHeader("X-Trino-Source", source ?? "nodejs")

    // set the catalog
    this.setHeader("X-Trino-Catalog", catalog)

    // set the schema
    if (schema) {
      this.setHeader("X-Trino-Schema", schema)
    }
  }

  /**
   * Sets a well-known Trino request header.
   *
   * @param key - A key from the {@link TrinoHeader} enum (e.g. `"X-Trino-Catalog"`).
   * @param value - The value to set.
   */
  setHeader(key: keyof typeof TrinoHeader, value: string) {
    this.headers.set(key, value)
  }

  /**
   * Sets an arbitrary request header without key validation.
   *
   * @param key - The raw HTTP header name.
   * @param value - The value to set.
   */
  setRawHeader(key: string, value: string) {
    this.headers.set(key, value)
  }

  /**
   * Returns all currently configured request headers as a plain object.
   *
   * @returns A record of header name/value pairs.
   */
  getHeaders() {
    return Object.fromEntries(this.headers.entries())
  }

  private static nextPagingUrl(response: QueryResult) {
    if (response.nextUri) {
      return {
        url: new URL(response.nextUri),
      }
    }

    return false
  }

  private async runStatement<T>({ sql, impersonateAs, gotOpts }: QueryProps) {
    const statementRequest = await got<QueryResult<T>>(
      `${this.host}:${this.port}/v1/statement`,
      {
        body: sql,
        headers: {
          ...this.getHeaders(),
          ...(impersonateAs ? { "X-Trino-User": impersonateAs } : {}),
        },
        https: {
          rejectUnauthorized: false,
        },
        method: "POST",
        responseType: "json",
        throwHttpErrors: false,
        ...gotOpts,
      }
    )

    if (!statementRequest.ok) {
      throw new Error(
        `${statementRequest.statusCode} - ${statementRequest.statusMessage}`
      )
    }

    return statementRequest.body
  }

  /**
   * Executes a SQL statement and collects all result pages into a single array.
   * Automatically follows `nextUri` pagination until the result set is complete.
   *
   * @param params - Query parameters.
   * @param params.sql - The SQL statement to execute.
   * @param params.impersonateAs - Optional Trino user to impersonate via `X-Trino-User`.
   * @param params.gotOpts - Optional `got` request options passed through to every request.
   * @returns A promise that resolves to the flat array of all result rows.
   */
  async query<T>({ sql, impersonateAs, gotOpts }: QueryProps): Promise<T[]> {
    const statementResult = await this.runStatement<T>({
      gotOpts,
      impersonateAs,
      sql,
    })

    const initialData: T[] = statementResult.data ?? []
    if (!statementResult.nextUri) {
      return initialData
    }

    const pagedData = await got.paginate.all<T>(statementResult.nextUri, {
      headers: this.getHeaders(),
      method: "GET",
      https: {
        rejectUnauthorized: false,
      },
      throwHttpErrors: false,
      ...gotOpts,
      pagination: {
        paginate: ({ response }: { response: Response<unknown> }) => {
          if (!response.ok) {
            throw new Error(
              `${response.statusCode} - ${response.statusMessage}`
            )
          }

          const parsed = Bourne.parse(response.body as string) as QueryResult<T>
          return TrinoClient.nextPagingUrl(parsed)
        },
        stackAllItems: true,
        transform: (response) => {
          const parsed = Bourne.parse(response.body as string) as QueryResult<T>
          return parsed.data ?? []
        },
      },
    })

    return [...initialData, ...pagedData]
  }

  /**
   * Executes a SQL statement and returns an async generator that yields rows
   * one at a time as pages are fetched. Prefer this over {@link query} for large
   * result sets to avoid holding all data in memory.
   *
   * @param params - Query parameters.
   * @param params.sql - The SQL statement to execute.
   * @param params.impersonateAs - Optional Trino user to impersonate via `X-Trino-User`.
   * @param params.gotOpts - Optional `got` request options passed through to every request.
   * @returns An async generator that yields individual result rows.
   */
  async stream<T>({
    sql,
    impersonateAs,
    gotOpts,
  }: QueryProps): Promise<AsyncGenerator<T>> {
    const statementResult = await this.runStatement<T>({
      gotOpts,
      impersonateAs,
      sql,
    })

    const initialData: T[] = statementResult.data ?? []
    const { nextUri } = statementResult

    const headers = this.getHeaders()
    const nextPagingUrl = (response: QueryResult<T>) =>
      TrinoClient.nextPagingUrl(response)

    return (async function* generator() {
      for (const row of initialData) {
        yield row
      }

      if (!nextUri) {
        return
      }

      for await (const row of got.paginate(nextUri, {
        headers,
        method: "GET",
        https: {
          rejectUnauthorized: false,
        },
        throwHttpErrors: false,
        ...gotOpts,
        pagination: {
          paginate: ({ response }: { response: Response<unknown> }) => {
            if (!response.ok) {
              throw new Error(
                `${response.statusCode} - ${response.statusMessage}`
              )
            }

            const parsed = Bourne.parse(
              response.body as string
            ) as QueryResult<T>
            return nextPagingUrl(parsed)
          },
          requestLimit: 10,
          transform: (response) => {
            const parsed = Bourne.parse(
              response.body as string
            ) as QueryResult<T>
            return parsed.data ?? []
          },
        },
      })) {
        yield row
      }
    })()
  }

  /**
   * Lists all schemas in the given catalog.
   *
   * @param params.catalog - The catalog to inspect.
   * @param params.gotOpts - Optional `got` request options.
   * @returns A promise that resolves to an array of schema name strings.
   */
  async schemas({ catalog, gotOpts }: GetSchemasProps) {
    const query = `SHOW SCHEMAS from ${catalog}`

    const schemas = await this.query<string[]>({ gotOpts, sql: query })
    return schemas.flat()
  }

  /**
   * Lists all base tables in the given catalog and schema.
   *
   * @param params.catalog - The catalog to inspect.
   * @param params.schema - The schema to inspect.
   * @param params.gotOpts - Optional `got` request options.
   * @returns A promise that resolves to an array of table name strings.
   */
  async tables({ catalog, schema, gotOpts }: GetTablesProps) {
    const query = `SELECT table_name from ${catalog}.information_schema.tables WHERE table_type = 'BASE TABLE' and table_schema='${schema}'`

    const schemas = await this.query<string[]>({
      gotOpts,
      sql: query,
    })

    return schemas.flat()
  }

  /**
   * Lists all views in the given catalog and schema.
   *
   * @param params.catalog - The catalog to inspect.
   * @param params.schema - The schema to inspect.
   * @param params.gotOpts - Optional `got` request options.
   * @returns A promise that resolves to an array of view name strings.
   */
  async views({ catalog, schema, gotOpts }: GetViewsProps) {
    const query = `SELECT table_name from ${catalog}.information_schema.tables WHERE table_type = 'VIEW' and table_schema='${schema}'`

    const schemas = await this.query<string[]>({
      gotOpts,
      sql: query,
    })
    return schemas.flat()
  }

  /**
   * Lists all columns for the given table.
   *
   * @param params.catalog - The catalog containing the table.
   * @param params.schema - The schema containing the table.
   * @param params.table - The table to describe.
   * @param params.gotOpts - Optional `got` request options.
   * @returns A promise that resolves to an array of tuples `[name, type, extra, description]`.
   */
  async columns({ catalog, schema, table, gotOpts }: GetColumnsProps) {
    const query = `SHOW COLUMNS from ${catalog}.${schema}.${table}`

    const columns = await this.query<
      [name: string, type: string, extra: string, description: string]
    >({ gotOpts, sql: query })

    return columns
  }
}
