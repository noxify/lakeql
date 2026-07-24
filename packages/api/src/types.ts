import type { MergedScalars } from "@pothos/core"
import type { StandardSchemaV1 } from "@pothos/plugin-validation"
import type { createYoga } from "graphql-yoga"
import type { JWTPayload } from "jose"

/**
 * The GraphQL context object available in every resolver.
 */
export interface Context {
  /**
   * Authenticated user payload from JWT verification, or `null` for unauthenticated requests.
   *
   * @see {@link https://github.com/panva/jose/blob/main/docs/types/interfaces/JWTPayload.md | jose - JWTPayload}
   */
  currentUser: JWTPayload | null
  /** Configured permission rules for technical users. */
  permissions: Permission[]
  /** Custom resolver for read permission checks. */
  hasReadPermission?: ReadPermissionResolver
  /** Custom resolver for write permission checks. */
  hasWritePermission?: WritePermissionResolver
}

export interface PermissionFields {
  catalog: string
  schema: string
  tableName: string
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

export interface ErrorMessage {
  errorCode?: number
  message?: string
  code?: string
  /**
   * Validation issues from schema validation or custom error details.
   *
   * @see {@link https://standardschema.dev | Standard Schema Spec}
   */
  additionalInformation?:
    | readonly StandardSchemaV1.Issue[]
    | Record<string, unknown>[]
}

/**
 * Permission rule for a technical user, defining which catalogs/schemas/tables they can read and write.
 */
export interface Permission {
  /** Username to match against `currentUser.userName`. */
  name: string
  /** Whether this user's queries run via the Trino system user. */
  useSystemUser: boolean
  /** Read and write access rules. */
  permissions: {
    /** Read access rules (catalog + schema + tables). Use `["*"]` for wildcard table access. */
    Query: {
      catalog: string
      schema: string
      tables: string[]
    }[]
    /** Write access rules (catalog + schema + tables). Use `["*"]` for wildcard table access. */
    Mutation: {
      catalog: string
      schema: string
      tables: string[]
    }[]
  }
}

export type GetUserResolver = (
  req: Request
) => Promise<JWTPayload | null | undefined> | JWTPayload | null | undefined

export type ReadPermissionResolver = (
  args: {
    context: {
      currentUser: JWTPayload | null
      permissions: Permission[]
    }
  } & PermissionFields
) => boolean | Promise<boolean>

export type WritePermissionResolver = (
  args: {
    context: {
      currentUser: JWTPayload | null
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

export type TrinoArrayResponse<T> = [number, ...T[]]

export interface WrappedTrinoResponse<T> {
  total_count: number
  data: T[]
}

declare module "jose" {
  export interface JWTPayload {
    userName: string
  }
}
