import type { JWTPayload, Permission, ResolvedIdentity } from "@lakeql/config"
import type {
  DataSourceReadStrategy,
  DataSourceWriteStrategy,
} from "@lakeql/datasource"
import type { MergedScalars } from "@pothos/core"
import type { createYoga } from "graphql-yoga"

/**
 * Adapter-agnostic permission target fields.
 *
 * `dataSource` and `tableName` are always required.
 * `catalog` and `schema` are optional — some adapters
 * expose flat namespaces without catalogs or schemas.
 */
export interface PermissionFields {
  dataSource: string
  tableName: string
  catalog?: string
  schema?: string
}

/**
 * The GraphQL context object available in every resolver.
 */
export interface Context {
  /**
   * Decoded JWT payload from token verification, or `null` for unauthenticated requests.
   */
  currentUser: JWTPayload | null
  /**
   * Resolved identity information (user name, SP flag), or `null` when unauthenticated.
   */
  identity: ResolvedIdentity | null
  /** Configured permission rules for technical users. */
  permissions: Permission[]
  /** Custom resolver for read permission checks. */
  hasReadPermission?: ReadPermissionResolver
  /** Custom resolver for write permission checks. */
  hasWritePermission?: WritePermissionResolver
  /**
   * Resolves the read strategy for a configured data-source name.
   *
   * Delegates to the runtime passed to `defineApiConfig`. Always present;
   * when the API was configured without a runtime, calling it throws.
   */
  getReadStrategy: (name: string) => DataSourceReadStrategy
  /**
   * Resolves the write strategy for a configured data-source name.
   *
   * Delegates to the runtime passed to `defineApiConfig`. Undefined when
   * the API was configured without a runtime.
   */
  getWriteStrategy?: (name: string) => DataSourceWriteStrategy
}

export interface UserScalars {
  Scalars: {
    ID: {
      Output: number | string
      Input: string
    }
    Date: {
      Output: Date
      Input: Date
    }
    DateTime: {
      Output: Date
      Input: Date
    }
    File: {
      Input: File
      Output: never
    }
  }
}

export type BuilderScalar = keyof MergedScalars<UserScalars>

export interface PageInfoInterface {
  maxPages: number
  hasNext: boolean
  hasPrevious: boolean
  currentPage: number
  nextPage: number | null
  previousPage: number | null
}

export type ReadPermissionResolver = (
  args: {
    context: {
      currentUser: JWTPayload | null
      identity: ResolvedIdentity | null
      permissions: Permission[]
    }
  } & PermissionFields
) => boolean | Promise<boolean>

export type WritePermissionResolver = (
  args: {
    context: {
      currentUser: JWTPayload | null
      identity: ResolvedIdentity | null
      permissions: Permission[]
    }
  } & PermissionFields
) => boolean | Promise<boolean>

/**
 * Subset of GraphQL Yoga's `createYoga` options, excluding `schema` and `context` which are managed internally.
 *
 * @see {@link https://the-guild.dev/graphql/yoga-server/docs | GraphQL Yoga Docs}
 */
export type YogaConfigOverrides = Omit<
  NonNullable<Parameters<typeof createYoga>[0]>,
  "schema" | "context"
>

export interface ConnectionInterface<T> {
  totalCount: number
  pageInfo: PageInfoInterface
  nodes: T[]
}
