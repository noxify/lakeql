// @lakeql/adapter-trino — public exports

/** Trino adapter factory implementing the neutral AdapterFactory contract. */
export { trinoAdapterFactory } from "./adapter"

/**
 * AdapterDefinition-compatible registration value for defineConfig().
 * Structurally compatible with AdapterDefinition<"trino", TrinoConnectionConfig>
 * without importing @lakeql/config.
 */
export { trinoAdapterDefinition } from "./adapter"

/** Adapter name constant for the Trino adapter, re-exported from constants. */
export { ADAPTER_NAME } from "./constants"

export { validateTrinoConfig, validateTrinoWriteConfig } from "./config"
export type {
  TrinoConnectionConfig,
  TrinoAuth,
  TrinoBasicAuth,
  TrinoBearerAuth,
  TrinoWriteConfig,
  TrinoStorageWriteConfig,
  TrinoInsertWriteConfig,
} from "./config"

export { classifyTrinoError } from "./errors"

export { trinoDialect } from "./dialect"

export { trinoResponseNormalizer } from "./normalizer"

export { trinoTypeMapper } from "./type-mapper"

export { createHiveTableManager } from "./hive-table-manager"
export type { HiveTableManagerConfig } from "./hive-table-manager"

export { createTrinoWriteStrategy } from "./write-strategy"
export type { TrinoWriteStrategyConfig } from "./write-strategy"

export {
  createTrinoInsertWriteStrategy,
  DEFAULT_BATCH_SIZE,
} from "./insert-write-strategy"
export type { TrinoInsertWriteStrategyConfig } from "./insert-write-strategy"
