/**
 * Adapter-neutral contracts for LakeQL data sources, read strategies,
 * write strategies, and adapter factories.
 *
 * Package: lakeql/datasource
 */

// Types
export type { AdapterName, SourceConfig } from "./types/adapter"
export type { DataSourceAuth, ResolveAuth } from "./types/auth"
export type { DataSourceCapabilities } from "./types/capabilities"
export type { DataSource } from "./types/datasource"
export type { ColumnInfo, QueryProps, TableDefinition } from "./types/metadata"
export type { PrimitiveType, TypeMapper } from "./types/type-mapper"
export type {
  DataSourceReadInput,
  DataSourceReadResult,
  DataSourceReadStrategy,
  ReadStrategyPaging,
} from "./types/read"
export type {
  DataSourceWriteConfig,
  DataSourceWriteInput,
  DataSourceWriteStrategy,
  LoadStrategy,
} from "./types/write"
export type { AdapterFactory } from "./types/adapter-factory"

// Runtime exports — errors
export {
  AuthenticationError,
  CancellationError,
  DataSourceError,
  type DataSourceErrorCategory,
  DataSourceValidationError,
  NetworkError,
  QueryExecutionError,
  TimeoutError,
  UnsupportedOperationError,
} from "./errors/index"

// Runtime exports — strategies
export { UnsupportedWriteStrategy } from "./unsupported-write-strategy"

// Runtime exports — type mapping
export { createTypeMapper } from "./type-mapper-factory"
export type { TypeMapperTables } from "./type-mapper-factory"

// Runtime exports — validation
export { DEFAULT_MAX_PER_PAGE, validatePaging } from "./validation/paging"
export type { ReadValidationConfig } from "./validation/paging"

// Runtime exports — shared SQL rendering primitives
export {
  escapeLiteral,
  isPlainObject,
  quoteQualified,
  rejectControlChars,
} from "./sql/sql-primitives"
