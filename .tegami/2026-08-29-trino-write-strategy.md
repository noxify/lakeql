---
packages:
  "npm:@lakeql/adapter-trino": minor
---

### Add write support to the Trino adapter

Implements `TrinoWriteStrategy` and `HiveTableManager` in `@lakeql/adapter-trino`. The adapter now supports `full_load`, `full_load_append`, and `append` write modes via the `@lakeql/storage` write pipeline. HiveTableManager uses a shadow-table pattern for safe DDL replacement with properly quoted identifiers.
