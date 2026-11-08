/**
 * Fabric-specific {@link ResponseNormalizer} implementation.
 *
 * Fabric's TDS driver returns the presence sentinel as the integer `1` rather
 * than a boolean, so a real data row's sentinel is `true` or `1`. All other
 * CTE decoding is shared with the Trino adapter via
 * {@link createCteResponseNormalizer}.
 *
 * @module
 */

import { createCteResponseNormalizer } from "@lakeql/response-transformer"
import type { ResponseNormalizer } from "@lakeql/response-transformer"

import { ADAPTER_NAME } from "./constants"
import { isPlainObject } from "./sql-helpers"

/**
 * Fabric response normalizer implementing the neutral
 * {@link ResponseNormalizer} contract. Accepts `true` or `1` as the record
 * sentinel (T-SQL returns `1`).
 */
export const fabricResponseNormalizer: ResponseNormalizer =
  createCteResponseNormalizer({
    adapterName: ADAPTER_NAME,
    isPresentSentinel: (value) => value === true || value === 1,
    acceptedSentinelDescription: "true/1",
    isPlainObject,
  })
