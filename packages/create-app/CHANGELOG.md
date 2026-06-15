# @lakeql/create-app

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
