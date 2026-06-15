---
"@lakeql/adapters": minor
---

Add write pipeline support to `@lakeql/adapters`.

- `createStorageOperations` — S3 file upload and prefix deletion via `files-sdk`
- `createHiveTableManager` — Hive external table DDL management (DROP + CREATE) with rollback support for table pairs
- `executeWritePipeline` — orchestrates the full write flow (Parquet conversion → S3 upload → Hive DDL) with three configurable load strategies: `full_load`, `full_load_append`, and `append`
