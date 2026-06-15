# @lakeql/adapters

## 0.3.0

### Minor Changes

- abadd24: Add configurable storage adapter type (`s3` | `minio`) to the mutation pipeline. Credentials are read from standard environment variables per adapter (AWS*\* for S3, MINIO*\* for MinIO). The `bucket` field is now part of the per-endpoint mutation configuration alongside `basePath`. Generated `config.ts` exports a typed `storageConfig` object.

## 0.2.1

### Patch Changes

- d904088: Add package README with description, installation instructions, and documentation link.
- Updated dependencies [d904088]
  - @lakeql/parquet@0.2.1

## 0.2.0

### Minor Changes

- c30f3d9: Add write pipeline support to `@lakeql/adapters`.
  - `createStorageOperations` — S3 file upload and prefix deletion via `files-sdk`
  - `createHiveTableManager` — Hive external table DDL management (DROP + CREATE) with rollback support for table pairs
  - `executeWritePipeline` — orchestrates the full write flow (Parquet conversion → S3 upload → Hive DDL) with three configurable load strategies: `full_load`, `full_load_append`, and `append`

### Patch Changes

- Updated dependencies [c30f3d9]
- Updated dependencies [c30f3d9]
  - @lakeql/parquet@0.2.0
  - @lakeql/trino-client@0.3.0
