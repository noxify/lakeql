---
packages:
  "npm:@lakeql/adapter-trino": patch
---

### Remove legacy @lakeql/adapters package

The monolithic `@lakeql/adapters` package has been removed. Its responsibilities are now covered by `@lakeql/storage` (write pipeline, storage operations, serializer/table-manager contracts) and `@lakeql/adapter-trino` (HiveTableManager, TrinoWriteStrategy). CLI codegen and the app template now import from `@lakeql/storage` instead.
