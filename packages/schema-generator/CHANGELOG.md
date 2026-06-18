# @lakeql/schema-generator

## 0.4.3

### Patch Changes

- dec54a0: Improve CLI pull UX and harden code generation/error handling.

  - fix CLI argument parsing so `pull` executes instead of showing help
  - improve CLI error rendering with clearer contextual messages
  - remove implicit dotenv loading from CLI runtime (environment must be provided by caller)
  - add interactive pull task progress and generate config registry once per run
  - expand logger console helpers with `info` and `warning`
  - harden schema generation for invalid field names by central normalization in schema-generator
  - add/adjust regression tests for pull output and identifier handling

## 0.4.2

### Patch Changes

- b48beff: Bump tsdown devDependency from 0.22.2 to 0.22.3
- Updated dependencies [b48beff]
  - @lakeql/helpers@0.1.4

## 0.4.1

### Patch Changes

- 3ba4ef2: add missing endpoint check for minio

## 0.4.0

### Minor Changes

- 3d4e6c9: Add configurable partitioning support for write pipelines
  - Introduce `partitioning` and `partitioningFormat` options to mutation config
  - Support timestamp-based (default), field-based, custom format, and disabled partitioning modes
  - Add validation for custom partition format strings with date component extraction
  - Enrich schema and records with `load_timestamp` for timestamp-based partitioning
  - Generate flat paths when partitioning is disabled
  - Group records by partition field or custom format segments
  - Wire partitioning config through CLI generation and file-generator output

### Patch Changes

- 5c3c967: update dependencies
- Updated dependencies [5c3c967]
  - @lakeql/helpers@0.1.3

## 0.3.0

### Minor Changes

- abadd24: Add configurable storage adapter type (`s3` | `minio`) to the mutation pipeline. Credentials are read from standard environment variables per adapter (AWS*\* for S3, MINIO*\* for MinIO). The `bucket` field is now part of the per-endpoint mutation configuration alongside `basePath`. Generated `config.ts` exports a typed `storageConfig` object.

## 0.2.1

### Patch Changes

- 136670e: Hardened the generators by adding an explicit root-model guard, making mutation config handling treat empty mutation lists as disabled, and switching JSON schema generation to fail fast instead of silently swallowing invalid field definitions.

## 0.2.0

### Minor Changes

- c30f3d9: Add mutation pipeline support across the LakeQL stack.
  - **schema-generator**: Extend endpoint definition schema with optional `mutation` config (load strategy + base path) and per-field `options` (required, validations)
  - **cli**: Generate working mutation resolvers that invoke the write pipeline, generate Zod validation schemas from field options, display mutation config in `create-endpoint` summary, set `mutation: false` for pulled endpoints
  - **api/trino-client/create-app**: Dependency updates to support the new write pipeline integration

## 0.1.2

### Patch Changes

- 450ba80: Add package description and keywords to package.json for npm discoverability
- 2432512: Extract inline parameter types into named exported interfaces with JSDoc for improved API reference documentation
- Updated dependencies [450ba80]
- Updated dependencies [2432512]
  - @lakeql/helpers@0.1.2

## 0.1.1

### Patch Changes

- 974e04d: Add package README files
- Updated dependencies [974e04d]
  - @lakeql/helpers@0.1.1

## 0.1.0

### Minor Changes

- 12dd6ae: initial release

### Patch Changes

- Updated dependencies [12dd6ae]
  - @lakeql/helpers@0.1.0
