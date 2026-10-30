import { isPlainObject } from "./sql-helpers"

/**
 * OAuth2 client credentials authentication for Azure AD.
 */
export interface FabricOAuth2Auth {
  type: "oauth2"
  /** Azure AD tenant ID. */
  tenantId: string
  /** Azure AD application (client) ID. */
  clientId: string
  /** Azure AD client secret. */
  clientSecret: string
  /** Optional scope override. */
  scope?: string
}

/**
 * Bearer token authentication (e.g. pre-acquired OAuth2 token).
 */
export interface FabricBearerAuth {
  type: "bearer"
  /** The bearer token value. */
  token: string
}

/**
 * Authentication credentials for a Fabric connection — either OAuth2
 * client credentials or a static bearer token.
 */
export type FabricAuth = FabricOAuth2Auth | FabricBearerAuth

/**
 * Configuration for connecting to a Microsoft Fabric SQL endpoint.
 *
 * Fields mirror `FabricClientProps` from `@lakeql/fabric-client`. The outer
 * runtime definition owns adapter selection through its `adapter` field;
 * this type intentionally does not include an inner adapter discriminator.
 */
export interface FabricConnectionConfig {
  /** Fabric SQL endpoint hostname (e.g. `"your-endpoint.datawarehouse.fabric.microsoft.com"`). */
  host: string
  /** Port the Fabric SQL endpoint listens on (typically `1433`). */
  port: number
  /** Default catalog (database) for all queries. */
  catalog: string
  /** Authentication credentials. */
  auth: FabricAuth
  /** Source identifier for diagnostics. */
  source?: string
}

function assertNonEmptyString(
  value: unknown,
  field: string
): asserts value is string {
  if (typeof value !== "string" || value === "") {
    throw new Error(
      `Invalid Fabric config: "${field}" must be a non-empty string`
    )
  }
}

/**
 * Assertion-style validator for {@link FabricConnectionConfig}.
 *
 * Validates the shape and constraints of a Fabric connection configuration
 * payload. Throws a plain `Error` synchronously when the input is invalid.
 * Error messages identify the offending field by name but never include
 * client secrets, bearer tokens, or serialized configuration objects.
 *
 * The same implementation is used at both the `defineConfig()` boundary
 * (via `fabricAdapterDefinition.validateDataSourceConfig`) and the
 * `fabricAdapterFactory.createDataSource()` boundary, ensuring a single
 * set of validation rules.
 *
 * @param config - The unknown value to validate.
 * @throws {Error} When the input is not a valid `FabricConnectionConfig`.
 */
export function validateFabricConfig(
  config: unknown
): asserts config is FabricConnectionConfig {
  if (!isPlainObject(config)) {
    throw new Error("Invalid Fabric config: expected a non-null plain object")
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
      'Invalid Fabric config: "port" must be a finite integer in the range 1–65535'
    )
  }

  assertNonEmptyString(config.catalog, "catalog")

  if (!isPlainObject(config.auth)) {
    throw new Error(
      'Invalid Fabric config: "auth" must be a non-null plain object'
    )
  }

  const { auth } = config
  const authType = auth.type

  if (authType === "oauth2") {
    assertNonEmptyString(auth.tenantId, "auth.tenantId")
    assertNonEmptyString(auth.clientId, "auth.clientId")
    assertNonEmptyString(auth.clientSecret, "auth.clientSecret")

    if (auth.scope !== undefined) {
      assertNonEmptyString(auth.scope, "auth.scope")
    }

    // Reject surplus fields
    const allowedOAuth2 = new Set([
      "type",
      "tenantId",
      "clientId",
      "clientSecret",
      "scope",
    ])
    const surplusOAuth2 = Object.keys(auth).filter((k) => !allowedOAuth2.has(k))
    if (surplusOAuth2.length > 0) {
      throw new Error(
        'Invalid Fabric config: "auth" contains unexpected fields; oauth2 auth allows only type, tenantId, clientId, clientSecret, scope'
      )
    }
  } else if (authType === "bearer") {
    assertNonEmptyString(auth.token, "auth.token")

    // Reject surplus fields
    const allowedBearer = new Set(["type", "token"])
    const surplusBearer = Object.keys(auth).filter((k) => !allowedBearer.has(k))
    if (surplusBearer.length > 0) {
      throw new Error(
        'Invalid Fabric config: "auth" contains unexpected fields; bearer auth allows only type, token'
      )
    }
  } else {
    throw new Error(
      'Invalid Fabric config: "auth.type" must be "oauth2" or "bearer"'
    )
  }

  if (config.source !== undefined) {
    assertNonEmptyString(config.source, "source")
  }
}
