/**
 * Adapter-factory registry and composition layer for LakeQL runtimes.
 *
 * Package: @lakeql/config
 */

export { AdapterRegistry } from "./adapter-registry"
export type {
  AuthConfig,
  IdentityResolver,
  ImpersonationResolver,
  JWTPayload,
  Permission,
  PermissionRule,
  ResolvedIdentity,
  TokenResolver,
} from "./auth-types"
export { createLakeQLRuntime } from "./create-runtime"
export { defineConfig } from "./define-config"
export { RuntimeLifecycleManager } from "./lifecycle-manager"
export {
  AdapterNameMismatchError,
  DataSourceConfigError,
  DuplicateAdapterError,
  RuntimeConstructionError,
  UnknownAdapterError,
  UnknownDataSourceError,
  WriteStrategyNotConfiguredError,
} from "./errors"
export { loadConfig } from "./load-config"
export type { LoadConfigOptions } from "./load-config"
export type {
  AdapterDefinition,
  DataSourceConfigInput,
  DataSourceEntry,
  DataSourcesFor,
  MergedDataSourceConfig,
  NormalizedDataSourceEntry,
  NormalizedDataSourcesFor,
  ResolvedPaging,
  TypedLakeQLConfig,
} from "./define-config"
export type {
  CreateLakeQLRuntimeOptions,
  LakeQLRuntime,
  LoadedLakeQLConfig,
  LoadedLakeQLProject,
  RuntimeDataSourceDefinition,
} from "./types"
