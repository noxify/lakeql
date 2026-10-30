// Schema-aware, adapter-neutral record transformation.
export { transformRecords } from "./transform-records"
export type {
  TransformRecordsInput,
  TransformSchema,
} from "./transform-records"

// Adapter-neutral normalizer contracts (SQL Adapter Foundations).
export type {
  NormalizedResponse,
  ResponseNormalizationInput,
  ResponseNormalizer,
} from "./normalizer"

// Shared factory for the CTE-based normalizer used by SQL adapters.
export { createCteResponseNormalizer } from "./cte-normalizer"
export type { CteResponseNormalizerOptions } from "./cte-normalizer"
