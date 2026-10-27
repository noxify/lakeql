---
packages:
  "@lakeql/storage":
    type: minor
  "@lakeql/datasource":
    type: minor
  "@lakeql/sql-read-strategy":
    type: minor
  "@lakeql/adapter-trino":
    type: minor
---

### Upload content type is preserved through the write pipeline

`@lakeql/storage` `StorageOperations.upload` now accepts optional `UploadOptions` with a `contentType`, and the write pipeline forwards the serializer's `contentType` (e.g. `application/vnd.apache.parquet`) to each upload. The content type is only sent to the underlying storage when set, so existing behavior is unchanged when it is absent.

### Read pagination is bounded and sorting is shape-checked

`@lakeql/datasource` adds a `ReadValidationConfig { maxPerPage }` and extends `validatePaging` to reject a `perPage` above the limit (default `10000`) and a non-array `sorting` value. `@lakeql/sql-read-strategy` accepts an optional `readValidation` config, validates paging before building a query, and logs a warning (instead of failing) when a filter is not an object.

### Deterministic `keepShadowTables` resolution

`@lakeql/storage` exports `resolveKeepShadowTables`, which resolves the setting with a fixed precedence (`DataSourceWriteConfig` > `WritePipelineConfig` > `HiveTableManagerConfig` > `false`). `TableManager.recreateTable` and `recreateTablePair` accept per-call options so the resolved value reaches the shadow-table logic; the Trino `HiveTableManager` honors the per-call value and falls back to its configured default.

### Trino external-location URI derivation

`@lakeql/adapter-trino` maps `s3`, `minio`, `r2`, and `wasabi` to `s3a://` (alongside `gcs` → `gs://` and `azure` → `abfss://`), resolves the provider name case-insensitively, and emits a one-time warning when a prefix is auto-derived. Set `externalLocationPrefix` explicitly to bypass derivation.
