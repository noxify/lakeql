// @lakeql/fabric-client — public exports

export { FabricClient } from "./client"

export { withRetry } from "./retry"
export type { RetryConfig } from "./retry"

export { FABRIC_TOKEN_SCOPE, resolveCredential } from "./auth"
export type { TokenCredential } from "./auth"

export {
  FabricClientError,
  FabricCancellationError,
  FabricQueryError,
  FabricTimeoutError,
} from "./errors"

export type { FabricAuth, FabricClientProps, QueryProps } from "./types"
