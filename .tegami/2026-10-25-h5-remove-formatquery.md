---
packages:
  "@lakeql/query-builder":
    type: major
  "@lakeql/adapter-trino":
    type: patch
  "@lakeql/adapter-fabric":
    type: patch
---

### Remove `formatQuery` and the `formatterLanguage` dialect field

Dropped the unused query-formatting surface from `@lakeql/query-builder`:

- removed the `formatQuery` function and its `FormatQueryProps` type;
- removed the required `formatterLanguage` field from the `QueryDialect` interface, so adapter authors no longer have to supply an SQL-formatter language that nothing consumed;
- dropped the `sql-formatter` runtime dependency.

The Trino and Fabric dialects no longer set `formatterLanguage`. Custom adapters that implement `QueryDialect` must remove the field.
