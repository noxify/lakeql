## @lakeql/adapters@0.6.2

### Migrate release tooling from Changesets to Tegami

Replaced Changesets with Tegami for versioning and publishing.

### Update dependencies

Updated all dependencies to their latest versions.

# @lakeql/adapters

## 0.6.1

### Patch Changes

- @lakeql/schema-generator@0.4.5

## 0.6.0

### Minor Changes

- fa9ebb4: Fix Hive external table locations for write pipeline

  - Use `s3a://` URI scheme instead of `s3://` for Hive external table locations. The Hive connector uses Hadoop's FileSystem which only supports `s3a://`.
  - Upload Parquet files into a directory (`latest.parquet/<uuid>.parquet`) instead of as a single file (`latest.parquet`). Hive requires `external_location` to point to a directory, not a file.
  - Add `buildExternalLocation()` method to `HiveTableManager` to encapsulate the URI scheme logic. The write pipeline now delegates location building to the adapter instead of constructing URIs directly.

## 0.5.1

### Patch Changes

- bfcca1a: update dependencies
- Updated dependencies [bfcca1a]
  - @lakeql/parquet@0.2.4
  - @lakeql/schema-generator@0.4.4
  - @lakeql/trino-client@0.4.1

## 0.5.0

### Minor Changes

- 9af4dcc: Add `load_timestamp_year` and `load_timestamp_month` as materialized partition fields. When timestamp partitioning is active, these integer fields are automatically injected alongside `load_timestamp` into every record and the JSON Schema. This enables direct filtering by year/month in tools that read Parquet files from S3 without Hive metastore awareness (e.g. Jupyter notebooks with PyArrow, Pandas, or DuckDB).

## 0.4.3

### Patch Changes

- Updated dependencies [dec54a0]
  - @lakeql/schema-generator@0.4.3

## 0.4.2

### Patch Changes

- b48beff: Bump tsdown devDependency from 0.22.2 to 0.22.3
- Updated dependencies [b48beff]
- Updated dependencies [de184c3]
  - @lakeql/parquet@0.2.3
  - @lakeql/schema-generator@0.4.2
  - @lakeql/trino-client@0.4.0

## 0.4.1

### Patch Changes

- Updated dependencies [3ba4ef2]
  - @lakeql/schema-generator@0.4.1

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
- Updated dependencies [3d4e6c9]
- Updated dependencies [5c3c967]
  - @lakeql/schema-generator@0.4.0
  - @lakeql/trino-client@0.3.1
  - @lakeql/parquet@0.2.2

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
