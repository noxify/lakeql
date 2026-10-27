import type { RetryConfig } from "@lakeql/trino-client"

import { isPlainObject } from "./sql-helpers"

/**
 * Basic authentication using username and password.
 */
export interface TrinoBasicAuth {
  type: "basic"
  /** The authentication username. */
  username: string
  /** The authentication password. */
  password: string
}

/**
 * Bearer token authentication (e.g. OAuth2 or JWT).
 */
export interface TrinoBearerAuth {
  type: "bearer"
  /** The bearer token value. */
  token: string
}

/**
 * Authentication credentials for a Trino connection — either basic
 * (username/password) or bearer (token).
 */
export type TrinoAuth = TrinoBasicAuth | TrinoBearerAuth

/**
 * Configuration for connecting to a Trino coordinator.
 *
 * Fields mirror `TrinoClientProps` from `@lakeql/trino-client`. The outer
 * runtime definition owns adapter selection through its `adapter` field;
 * this type intentionally does not include an inner adapter discriminator.
 */
export interface TrinoConnectionConfig {
  /** Trino coordinator hostname including protocol (e.g. `"https://trino.example.com"`). */
  host: string
  /** Port the Trino coordinator listens on. */
  port: number
  /** Default catalog for all queries. */
  catalog: string
  /** Optional default schema. */
  schema?: string
  /** Source identifier for Trino's `X-Trino-Source` header. */
  source?: string
  /** Authentication credentials. */
  auth: TrinoAuth
  /** Retry configuration forwarded unchanged to the Trino client. */
  retry?: RetryConfig
  /** Default query timeout in milliseconds. */
  timeout?: number
}

function assertNonEmptyString(
  value: unknown,
  field: string
): asserts value is string {
  if (typeof value !== "string" || value === "") {
    throw new Error(
      `Invalid Trino config: "${field}" must be a non-empty string`
    )
  }
}

/**
 * Storage (external-location + DDL) write strategy configuration.
 *
 * This is the existing Hive/upload strategy, selected by default. The
 * runtime injects `dataSource`; the config carries `files`, `serializer`,
 * and optional prefix/shadow-table settings (validated by the storage
 * strategy factory itself, not here).
 */
export interface TrinoStorageWriteConfig {
  /** Discriminator; defaults to `"storage"` when omitted. */
  strategy?: "storage"
  /** Adapter-owned storage-strategy fields (files, serializer, etc.). */
  [key: string]: unknown
}

/**
 * INSERT write strategy configuration. Writes via `INSERT INTO` with no
 * object storage.
 */
export interface TrinoInsertWriteConfig {
  /** Discriminator selecting the INSERT strategy. */
  strategy: "insert"
  /**
   * Maximum number of rows per `INSERT ... VALUES` batch.
   *
   * @default 1000
   */
  batchSize?: number
  /**
   * When `true`, issue `CREATE TABLE IF NOT EXISTS` before appending, and use
   * a pending-table swap for `full_load`.
   *
   * @default false
   */
  autoCreateTable?: boolean
  /** Optional table properties applied on table creation. */
  tableProperties?: Record<string, string>
}

/**
 * The Trino adapter's write configuration, a discriminated union on
 * `strategy`. Selects between the storage (default) and INSERT strategies.
 */
export type TrinoWriteConfig = TrinoStorageWriteConfig | TrinoInsertWriteConfig

/** Fields allowed on an INSERT write config. */
const INSERT_WRITE_FIELDS = new Set([
  "strategy",
  "batchSize",
  "autoCreateTable",
  "tableProperties",
])

/** Matches a safe SQL identifier for table-property keys. */
const SAFE_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u

/**
 * Validates the Trino adapter `writeConfig` and narrows it by `strategy`.
 *
 * An absent `strategy` is treated as `"storage"`. The `"storage"` branch is
 * validated by the storage strategy factory, so only its discriminator is
 * checked here. The `"insert"` branch is validated fully, rejecting surplus
 * fields and malformed options.
 *
 * @param writeConfig - The adapter-owned write configuration to validate.
 * @throws {Error} When the strategy is unknown or an INSERT option is invalid.
 */
export function validateTrinoWriteConfig(
  writeConfig: unknown
): asserts writeConfig is TrinoWriteConfig {
  if (!isPlainObject(writeConfig)) {
    throw new Error(
      "Invalid Trino writeConfig: expected a non-null plain object"
    )
  }

  const strategy = writeConfig.strategy ?? "storage"

  if (strategy === "storage") {
    // Storage-strategy fields are validated by createTrinoWriteStrategy.
    return
  }

  if (strategy !== "insert") {
    throw new Error(
      `Invalid Trino writeConfig: unknown strategy "${String(strategy)}"; expected "storage" or "insert"`
    )
  }

  const surplus = Object.keys(writeConfig).filter(
    (key) => !INSERT_WRITE_FIELDS.has(key)
  )
  if (surplus.length > 0) {
    throw new Error(
      `Invalid Trino writeConfig: unexpected field(s) for insert strategy: ${surplus.join(", ")}`
    )
  }

  const { batchSize, tableProperties } = writeConfig
  if (
    batchSize !== undefined &&
    (typeof batchSize !== "number" ||
      !Number.isInteger(batchSize) ||
      batchSize < 1)
  ) {
    throw new Error(
      'Invalid Trino writeConfig: "batchSize" must be a positive integer'
    )
  }

  if (
    writeConfig.autoCreateTable !== undefined &&
    typeof writeConfig.autoCreateTable !== "boolean"
  ) {
    throw new TypeError(
      'Invalid Trino writeConfig: "autoCreateTable" must be a boolean'
    )
  }

  if (tableProperties !== undefined) {
    if (!isPlainObject(tableProperties)) {
      throw new Error(
        'Invalid Trino writeConfig: "tableProperties" must be a plain object'
      )
    }
    for (const key of Object.keys(tableProperties)) {
      if (!SAFE_IDENTIFIER_RE.test(key)) {
        throw new Error(
          `Invalid Trino writeConfig: table property key "${key}" is not a safe identifier`
        )
      }
    }
  }
}

/**
 * Assertion-style validator for {@link TrinoConnectionConfig}.
 *
 * Validates the shape and constraints of a Trino connection configuration
 * payload. Throws a plain `Error` synchronously when the input is invalid.
 * Error messages identify the offending field by name but never include
 * passwords, bearer tokens, authorization headers, or serialized
 * configuration objects.
 *
 * The same implementation is used at both the `defineConfig()` boundary
 * (via `trinoAdapterDefinition.validateDataSourceConfig`) and the
 * `trinoAdapterFactory.createDataSource()` boundary, ensuring a single
 * set of validation rules.
 *
 * @param config - The unknown value to validate.
 * @throws {Error} When the input is not a valid `TrinoConnectionConfig`.
 */
export function validateTrinoConfig(
  config: unknown
): asserts config is TrinoConnectionConfig {
  if (!isPlainObject(config)) {
    throw new Error("Invalid Trino config: expected a non-null plain object")
  }

  assertNonEmptyString(config.host, "host")

  const { port } = config
  if (
    typeof port !== "number" ||
    !Number.isFinite(port) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error(
      'Invalid Trino config: "port" must be a finite integer in the range 1–65535'
    )
  }

  assertNonEmptyString(config.catalog, "catalog")

  if (!isPlainObject(config.auth)) {
    throw new Error(
      'Invalid Trino config: "auth" must be a non-null plain object'
    )
  }

  const { auth } = config
  const authType = auth.type

  if (authType === "basic") {
    assertNonEmptyString(auth.username, "auth.username")
    assertNonEmptyString(auth.password, "auth.password")

    // Reject surplus fields: auth must be exactly one of the allowed forms.
    const allowedBasic = new Set(["type", "username", "password"])
    const surplusBasic = Object.keys(auth).filter((k) => !allowedBasic.has(k))
    if (surplusBasic.length > 0) {
      throw new Error(
        'Invalid Trino config: "auth" contains unexpected fields; basic auth allows only type, username, password'
      )
    }
  } else if (authType === "bearer") {
    assertNonEmptyString(auth.token, "auth.token")

    // Reject surplus fields: auth must be exactly one of the allowed forms.
    const allowedBearer = new Set(["type", "token"])
    const surplusBearer = Object.keys(auth).filter((k) => !allowedBearer.has(k))
    if (surplusBearer.length > 0) {
      throw new Error(
        'Invalid Trino config: "auth" contains unexpected fields; bearer auth allows only type, token'
      )
    }
  } else {
    throw new Error(
      'Invalid Trino config: "auth.type" must be "basic" or "bearer"'
    )
  }

  if (config.schema !== undefined) {
    assertNonEmptyString(config.schema, "schema")
  }

  if (config.source !== undefined) {
    assertNonEmptyString(config.source, "source")
  }

  if (config.timeout !== undefined) {
    const { timeout } = config
    if (
      typeof timeout !== "number" ||
      !Number.isFinite(timeout) ||
      timeout <= 0
    ) {
      throw new Error(
        'Invalid Trino config: "timeout" must be a finite positive number'
      )
    }
  }

  // Individual RetryConfig fields are NOT validated here — the
  // TrinoClient applies its own defaults for missing fields.
  if (config.retry !== undefined && !isPlainObject(config.retry)) {
    throw new Error(
      'Invalid Trino config: "retry" must be a non-null plain object when provided'
    )
  }
}
