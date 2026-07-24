## @lakeql/parquet@0.2.5

### Migrate release tooling from Changesets to Tegami

Replaced Changesets with Tegami for versioning and publishing.

### Update dependencies

Updated all dependencies to their latest versions.

# @lakeql/parquet

## 0.2.4

### Patch Changes

- bfcca1a: update dependencies

## 0.2.3

### Patch Changes

- b48beff: Bump tsdown devDependency from 0.22.2 to 0.22.3

## 0.2.2

### Patch Changes

- 5c3c967: update dependencies

## 0.2.1

### Patch Changes

- d904088: Add package README with description, installation instructions, and documentation link.

## 0.2.0

### Minor Changes

- c30f3d9: Add `@lakeql/parquet` package for JSON Schema to Parquet conversion and writing.
  - `jsonSchemaToParquetSchema` — converts JSON Schema definitions to hyparquet-compatible `SchemaElement[]` with full type mapping (string, integer, number, boolean, date-time, nested objects, arrays)
  - `recordsToColumnar` — transforms row-oriented records into columnar format with type conversions (DateTime→Date, Integer→BigInt)
  - `writeParquet` — orchestrates schema conversion, columnar transformation, and binary serialization via hyparquet-writer
