---
packages:
  "@lakeql/api":
    type: minor
---

### Typed error for missing schema files

`loadSchema` now throws a typed `SchemaFilesNotFoundError` (exported alongside `loadSchema` and `SchemaLoadOptions`) instead of a generic `Error` when no generated schema files are found. The error carries the resolved `schemaDir`, so applications can catch it and print a concise message rather than a stack trace. The scaffolded app template now does exactly that on startup.
