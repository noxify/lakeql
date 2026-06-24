---
"@lakeql/adapters": minor
---

Fix Hive external table locations for write pipeline

- Use `s3a://` URI scheme instead of `s3://` for Hive external table locations. The Hive connector uses Hadoop's FileSystem which only supports `s3a://`.
- Upload Parquet files into a directory (`latest.parquet/<uuid>.parquet`) instead of as a single file (`latest.parquet`). Hive requires `external_location` to point to a directory, not a file.
- Add `buildExternalLocation()` method to `HiveTableManager` to encapsulate the URI scheme logic. The write pipeline now delegates location building to the adapter instead of constructing URIs directly.
