/**
 * Documentation manifest for the `@lakeql/api` public surface.
 *
 * The api-reference generator reads this file to enumerate the package's
 * public exports. It is not an importable runtime barrel — consumers import
 * from the specific submodules — so entries here exist to describe the API,
 * not to be re-imported as a bundle.
 *
 * @module
 */

export { builder } from "./builder"
export { defineApiConfig } from "./config"
export type {
  ApiRuntimeConfig,
  DefinedApiConfig,
  DefineConfigOptions,
} from "./config"
export { createApiResolveAuth } from "./resolve-auth"
export type {
  ApiAuthContext,
  CreateApiResolveAuthOptions,
  ResolveAuthSourceInfo,
} from "./resolve-auth"
export { trinoUserImpersonation } from "./trino-user-impersonation"
export type { TrinoUserImpersonationOptions } from "./trino-user-impersonation"
export { tokenResolver, hasReadPermission, hasWritePermission } from "./auth"
export { entraIdIdentityResolver } from "./identity"
export {
  handleErrorResponse,
  throwFirstError,
  createPermission,
} from "./helpers"
export type { PermissionFields } from "./helpers"
export { createApiServer, startApiServer } from "./server"
export { createYogaServer, serveYoga } from "./yoga"
export { createErrorLoggingPlugin } from "./error-logging-plugin"
export type { ApiErrorContext, ApiErrorHook } from "./error-logging-plugin"
export { loadSchema, SchemaFilesNotFoundError } from "./schema"
export type { SchemaLoadOptions } from "./schema"
export type {
  Context,
  ReadPermissionResolver,
  WritePermissionResolver,
  YogaConfigOverrides,
  PageInfoInterface,
  ConnectionInterface,
  UserScalars,
  BuilderScalar,
} from "./types"
