/**
 * `@lakeql/scaffold` — consumer-neutral scaffolding engine.
 *
 * Owns the declarative `Op`/`Plan` model, the TypeScript value serializer,
 * the plan→string builders, and greenfield file materialization. Both
 * `@lakeql/create-app` and `@lakeql/cli` build on these primitives instead of
 * duplicating them.
 */

export type {
  AddAdapterOp,
  AddDataSourceOp,
  AddDepsOp,
  AddEnvSchemaOp,
  AddEnvVarsOp,
  AddFileOp,
  Op,
  Plan,
} from "./ops"
export { applyOp, buildPlan, createPlan } from "./ops"

export type { TsExpr, TsValue } from "./ts-serializer"
export { expr, serializeTs } from "./ts-serializer"

export {
  generateEnvExample,
  generateEnvTs,
  generateLakeqlConfig,
} from "./builders"

export type { WriteMode } from "./materialize"
export { materializeFiles } from "./materialize"

export type {
  ApplyFeatureOptions,
  ApplyFeatureResult,
  ApplyMode,
} from "./apply-feature"
export { applyFeature, InvalidProjectError } from "./apply-feature"

export { fabricOboTemplate } from "./features/fabric-obo"
export type {
  FeatureContext,
  FeatureInput,
  FeatureResult,
  FeatureTemplate,
  ProjectPackageJson,
} from "./features/types"
export {
  featureRegistry,
  listFeatureIds,
  resolveFeatureTemplate,
  UnknownFeatureError,
} from "./features/registry"
