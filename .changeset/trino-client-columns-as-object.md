---
"@lakeql/trino-client": minor
---

Add `asObject` option to `columns()` method for returning typed objects instead of raw tuples

The `columns()` method now accepts an optional `asObject: true` parameter that returns `ColumnInfo[]` objects with named properties (`name`, `type`, `extra`, `description`) instead of raw `[string, string, string, string]` tuples. The default behavior (raw tuples) remains unchanged.
