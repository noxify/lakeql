# @lakeql/cli

## 0.3.0

### Minor Changes

- abadd24: Add configurable storage adapter type (`s3` | `minio`) to the mutation pipeline. Credentials are read from standard environment variables per adapter (AWS*\* for S3, MINIO*\* for MinIO). The `bucket` field is now part of the per-endpoint mutation configuration alongside `basePath`. Generated `config.ts` exports a typed `storageConfig` object.

### Patch Changes

- abadd24: Fix env validation still triggering for non-Trino commands after bundling. Replace eager `createEnv()` with lazy `getEnv()` that only validates when called. Use Commander's `.env()` for catalog option fallback. Remove unused `--no-interactive` flag from `create-endpoint`. Add `--force` flag to skip overwrite confirmation.
- abadd24: Stop generating `mutation-schema.ts` when no `mutation` config is present in the endpoint definition. Previously, omitting the `mutation` field would still produce a placeholder resolver.
- Updated dependencies [abadd24]
  - @lakeql/schema-generator@0.3.0
  - @lakeql/file-generator@0.1.5

## 0.2.4

### Patch Changes

- Updated dependencies [136670e]
  - @lakeql/file-generator@0.1.4
  - @lakeql/schema-generator@0.2.1

## 0.2.3

### Patch Changes

- e1650f8: Stop generating `mutation-schema.ts` when no `mutation` config is present in the endpoint definition. Previously, omitting the `mutation` field would still produce a placeholder resolver — now it correctly skips the file.

## 0.2.2

### Patch Changes

- 5031bcb: Defer env validation to commands that actually need Trino access. Commands like `create-endpoint`, `config-registry`, and `init` no longer require a valid `.env` file to run. Use Commander's `.env()` for catalog option fallback. Remove unused `--no-interactive` flag from `create-endpoint`.

## 0.2.1

### Patch Changes

- 878220b: Defer env validation to commands that actually need Trino access. Commands like `create-endpoint`, `config-registry`, and `init` no longer require a valid `.env` file to run.

## 0.2.0

### Minor Changes

- c30f3d9: Add mutation pipeline support across the LakeQL stack.
  - **schema-generator**: Extend endpoint definition schema with optional `mutation` config (load strategy + base path) and per-field `options` (required, validations)
  - **cli**: Generate working mutation resolvers that invoke the write pipeline, generate Zod validation schemas from field options, display mutation config in `create-endpoint` summary, set `mutation: false` for pulled endpoints
  - **api/trino-client/create-app**: Dependency updates to support the new write pipeline integration

### Patch Changes

- Updated dependencies [c30f3d9]
  - @lakeql/schema-generator@0.2.0
  - @lakeql/trino-client@0.3.0
  - @lakeql/file-generator@0.1.3

## 0.1.2

### Patch Changes

- 450ba80: Add package description and keywords to package.json for npm discoverability
- Updated dependencies [450ba80]
- Updated dependencies [9c7ff16]
- Updated dependencies [2432512]
  - @lakeql/response-transformer@0.1.2
  - @lakeql/schema-generator@0.1.2
  - @lakeql/file-generator@0.1.2
  - @lakeql/column-parser@0.1.2
  - @lakeql/trino-client@0.2.0
  - @lakeql/helpers@0.1.2
  - @lakeql/logger@0.1.2

## 0.1.1

### Patch Changes

- 974e04d: Add package README files
- Updated dependencies [974e04d]
  - @lakeql/column-parser@0.1.1
  - @lakeql/file-generator@0.1.1
  - @lakeql/helpers@0.1.1
  - @lakeql/logger@0.1.1
  - @lakeql/response-transformer@0.1.1
  - @lakeql/schema-generator@0.1.1
  - @lakeql/trino-client@0.1.1

## 0.1.0

### Minor Changes

- 12dd6ae: initial release

### Patch Changes

- Updated dependencies [12dd6ae]
  - @lakeql/column-parser@0.1.0
  - @lakeql/file-generator@0.1.0
  - @lakeql/helpers@0.1.0
  - @lakeql/logger@0.1.0
  - @lakeql/response-transformer@0.1.0
  - @lakeql/schema-generator@0.1.0
  - @lakeql/trino-client@0.1.0
