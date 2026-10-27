---
packages:
  "@lakeql/query-builder":
    type: minor
  "@lakeql/adapter-fabric":
    type: patch
  "@lakeql/adapter-trino":
    type: patch
---

### Dialect-aware record-present sentinel literal

The `records` CTE's `__lakeql_record_present` sentinel is now emitted through a new `QueryDialect.trueLiteral()` hook instead of a hard-coded `TRUE`. T-SQL backends such as Fabric have no boolean literal, so a Fabric read failed with `Invalid column name 'TRUE'` (SQL error 207). Trino's dialect returns `TRUE` and Fabric's returns `1`; both are accepted by their response normalizers.
