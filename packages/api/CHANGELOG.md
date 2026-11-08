## @lakeql/api@1.0.1

### Package metadata and publishing

Add READMEs for the packages that shipped without one, refine npm keywords (and drop the Trino-specific keyword from adapter-neutral packages), and re-publish every package through npm trusted publishing (OIDC) to validate the configuration. No runtime or API changes.

## @lakeql/api@1.0.0

### LakeQL 1.0 — first stable release on the adapter-based architecture

The 1.0 line is a ground-up restructure of the 0.x packages around a single adapter-based architecture: a neutral data-source/adapter contract, config + runtime composition, the Trino (read + write) and Fabric (read-only) adapters, the CLI (endpoint generation and `create-app`), and the GraphQL API layer.

This is a breaking release with no in-place upgrade path from the 0.x line — re-scaffold projects with `create-app` and re-author configuration against the 1.0 APIs rather than upgrading existing code.

## @lakeql/api@0.3.2

### Migrate release tooling from Changesets to Tegami

Replaced Changesets with Tegami for versioning and publishing.

### Update dependencies

Updated all dependencies to their latest versions.

# @lakeql/api

## 0.3.1

### Patch Changes

- Updated dependencies [eff63b4]
  - @lakeql/response-transformer@0.1.6
  - @lakeql/helpers@0.1.6

## 0.3.0

### Minor Changes

- fa9ebb4: Conditionally register `builder.mutationType({})` based on discovered schema files

  The GraphQL Mutation type is now only registered when at least one `mutation-schema.*` file is found in the schema directory. This prevents the Pothos error "Type Mutation must define one or more fields" when no mutations are configured, while automatically enabling mutations when mutation schema files exist. Users no longer need to manually call `builder.mutationType({})` in their generated code.

## 0.2.6

### Patch Changes

- bfcca1a: update dependencies
- Updated dependencies [bfcca1a]
  - @lakeql/helpers@0.1.5
  - @lakeql/logger@0.2.2
  - @lakeql/query-builder@0.1.5
  - @lakeql/response-transformer@0.1.5
  - @lakeql/trino-client@0.4.1

## 0.2.5

### Patch Changes

- Updated dependencies [dec54a0]
  - @lakeql/logger@0.2.1

## 0.2.4

### Patch Changes

- Updated dependencies [ef6209b]
  - @lakeql/logger@0.2.0

## 0.2.3

### Patch Changes

- b48beff: Improve JSDoc documentation for public interfaces

  - Added doc comments to `ApiServer` and `Context` interface members
  - Documented `SortInput`, `PagingInput` fields and `generateQuery` return value

- Updated dependencies [b48beff]
- Updated dependencies [b48beff]
- Updated dependencies [de184c3]
  - @lakeql/query-builder@0.1.4
  - @lakeql/helpers@0.1.4
  - @lakeql/logger@0.1.3
  - @lakeql/response-transformer@0.1.4
  - @lakeql/trino-client@0.4.0

## 0.2.2

### Patch Changes

- 3ba4ef2: update dependencies

## 0.2.1

### Patch Changes

- 5c3c967: update dependencies
- Updated dependencies [5c3c967]
  - @lakeql/response-transformer@0.1.3
  - @lakeql/query-builder@0.1.3
  - @lakeql/trino-client@0.3.1
  - @lakeql/helpers@0.1.3

## 0.2.0

### Minor Changes

- c30f3d9: Add mutation pipeline support across the LakeQL stack.
  - **schema-generator**: Extend endpoint definition schema with optional `mutation` config (load strategy + base path) and per-field `options` (required, validations)
  - **cli**: Generate working mutation resolvers that invoke the write pipeline, generate Zod validation schemas from field options, display mutation config in `create-endpoint` summary, set `mutation: false` for pulled endpoints
  - **api/trino-client/create-app**: Dependency updates to support the new write pipeline integration

### Patch Changes

- Updated dependencies [c30f3d9]
  - @lakeql/trino-client@0.3.0

## 0.1.2

### Patch Changes

- 450ba80: Add package description and keywords to package.json for npm discoverability
- Updated dependencies [450ba80]
- Updated dependencies [9c7ff16]
- Updated dependencies [2432512]
  - @lakeql/response-transformer@0.1.2
  - @lakeql/query-builder@0.1.2
  - @lakeql/trino-client@0.2.0
  - @lakeql/helpers@0.1.2
  - @lakeql/logger@0.1.2

## 0.1.1

### Patch Changes

- 974e04d: Add package README files
- Updated dependencies [974e04d]
  - @lakeql/helpers@0.1.1
  - @lakeql/logger@0.1.1
  - @lakeql/query-builder@0.1.1
  - @lakeql/response-transformer@0.1.1
  - @lakeql/trino-client@0.1.1

## 0.1.0

### Minor Changes

- 12dd6ae: initial release

### Patch Changes

- Updated dependencies [12dd6ae]
  - @lakeql/helpers@0.1.0
  - @lakeql/logger@0.1.0
  - @lakeql/query-builder@0.1.0
  - @lakeql/response-transformer@0.1.0
  - @lakeql/trino-client@0.1.0
