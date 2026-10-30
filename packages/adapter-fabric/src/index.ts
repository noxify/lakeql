/** Fabric adapter factory implementing the neutral AdapterFactory contract. */
export { fabricAdapterFactory } from "./adapter"

/**
 * AdapterDefinition-compatible registration value for defineConfig().
 * Structurally compatible with AdapterDefinition<"fabric", FabricConnectionConfig>
 * without importing @lakeql/config.
 */
export { fabricAdapterDefinition } from "./adapter"

/** Adapter name constant for the Fabric adapter, re-exported from constants. */
export { ADAPTER_NAME } from "./constants"

export { validateFabricConfig } from "./config"
export type {
  FabricConnectionConfig,
  FabricAuth,
  FabricOAuth2Auth,
  FabricBearerAuth,
} from "./config"

export { classifyFabricError } from "./errors"

export { fabricDialect } from "./dialect"

export { fabricResponseNormalizer } from "./normalizer"

export { fabricTypeMapper } from "./type-mapper"
