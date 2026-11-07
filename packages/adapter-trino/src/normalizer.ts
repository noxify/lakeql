/**
 * Trino-specific {@link ResponseNormalizer} implementation.
 *
 * Trino's `records` CTE emits the presence sentinel as the boolean literal
 * `TRUE`, so a real data row's sentinel is exactly `true`. All other CTE
 * decoding is shared with the Fabric adapter via
 * {@link createCteResponseNormalizer}.
 *
 * @module
 */

import { createCteResponseNormalizer } from "@lakeql/response-transformer"
import type { ResponseNormalizer } from "@lakeql/response-transformer"

import { ADAPTER_NAME } from "./constants"
import { isPlainObject } from "./sql-helpers"

/**
 * Trino response normalizer implementing the neutral
 * {@link ResponseNormalizer} contract. Accepts only `true` as the record
 * sentinel.
 */
export const trinoResponseNormalizer: ResponseNormalizer =
  createCteResponseNormalizer({
    adapterName: ADAPTER_NAME,
    isPresentSentinel: (value) => value === true,
    acceptedSentinelDescription: "true",
    isPlainObject,
  })
