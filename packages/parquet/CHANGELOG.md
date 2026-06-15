# @lakeql/parquet

## 0.2.0

### Minor Changes

- c30f3d9: Add `@lakeql/parquet` package for JSON Schema to Parquet conversion and writing.
  - `jsonSchemaToParquetSchema` — converts JSON Schema definitions to hyparquet-compatible `SchemaElement[]` with full type mapping (string, integer, number, boolean, date-time, nested objects, arrays)
  - `recordsToColumnar` — transforms row-oriented records into columnar format with type conversions (DateTime→Date, Integer→BigInt)
  - `writeParquet` — orchestrates schema conversion, columnar transformation, and binary serialization via hyparquet-writer
