---
packages:
  "@lakeql/parquet":
    type: minor
  "@lakeql/storage":
    type: minor
---

### Row-group-bounded Parquet writing

`@lakeql/parquet` adds `writeParquetStreaming({ records, jsonSchema, rowGroupSize? })`, which serializes Parquet one row group at a time via `parquetWriteRows` instead of transposing the whole dataset up front. Peak transposition memory now scales with `rowGroupSize` (default `10000`) rather than the total row count. It also exports `jsonSchemaToColumnDefs`, `transformRecord`, `transformRows`, and `DEFAULT_ROW_GROUP_SIZE`. `writeParquet` remains available unchanged.

### Configurable Parquet serializer row-group size

`parquetSerializer` in `@lakeql/storage` now accepts an optional `{ rowGroupSize }` and serializes via `writeParquetStreaming`. Existing `parquetSerializer()` calls are unaffected (default `10000`).
