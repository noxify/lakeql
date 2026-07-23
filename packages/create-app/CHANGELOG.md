# @lakeql/create-app

## 0.2.6

### Patch Changes

- bfcca1a: update dependencies

## 0.2.5

### Patch Changes

- 814d864: Update the create-app template prompt to use `my-lakeql-project` as the default placeholder for the project name.

## 0.2.4

### Patch Changes

- b48beff: Bump tsdown devDependency from 0.22.2 to 0.22.3

## 0.2.3

### Patch Changes

- 5c3c967: update dependencies

## 0.2.2

### Patch Changes

- abadd24: Fix `workspace:*` dependencies not being resolved to registry versions. Replace `read-pkg` with direct JSON file reading to avoid normalization stripping non-semver ranges. Generate `pnpm-workspace.yaml` during scaffolding to allow esbuild build scripts. Add `@lakeql/adapters` to template. Add project README.

## 0.2.1

### Patch Changes

- d904088: Fix `workspace:*` dependencies not being resolved to registry versions in scaffolded projects. Replaced `read-pkg` (which stripped non-semver ranges via normalization) with direct JSON file reading. Also added `@lakeql/adapters` to the template for mutation support.

## 0.2.0

### Minor Changes

- c30f3d9: Add mutation pipeline support across the LakeQL stack.
  - **schema-generator**: Extend endpoint definition schema with optional `mutation` config (load strategy + base path) and per-field `options` (required, validations)
  - **cli**: Generate working mutation resolvers that invoke the write pipeline, generate Zod validation schemas from field options, display mutation config in `create-endpoint` summary, set `mutation: false` for pulled endpoints
  - **api/trino-client/create-app**: Dependency updates to support the new write pipeline integration

## 0.1.2

### Patch Changes

- 450ba80: Add package description and keywords to package.json for npm discoverability
- d21df9c: fixed create command execution

## 0.1.1

### Patch Changes

- 974e04d: Add package README files

## 0.1.0

### Minor Changes

- 12dd6ae: initial release
