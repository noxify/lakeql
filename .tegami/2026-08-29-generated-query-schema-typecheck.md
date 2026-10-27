---
packages:
  "@lakeql/api":
    type: minor
  "@lakeql/datasource":
    type: minor
  "@lakeql/query-builder":
    type: minor
  "@lakeql/file-generator":
    type: patch
  "@lakeql/sql-read-strategy":
    type: patch
---

### Generated query schemas type-check cleanly

A pulled table's generated `query-schema.ts` now type-checks without manual fixups. Several contracts were aligned so the generated resolver is valid:

- `@lakeql/datasource`: `DataSourceReadResult.pageInfo` now carries `{ maxPages, hasNext, hasPrevious, currentPage, nextPage, previousPage }` (matching the GraphQL page-info shape) instead of `{ page, perPage, ... }`, so a read result can be returned directly as a connection.
- `@lakeql/api`: `Context.getReadStrategy` is now always present (it throws a clear error when the API was configured without a runtime), so resolvers can call it without a non-null guard. The built `builder` declaration also keeps the Pothos scope-auth / validation plugin type augmentations, so consumers see `authScopes` on field options.
- `@lakeql/query-builder`: `getSelectFields` now returns `string[]`, and `GenerateQueryProps.selectFields` accepts `readonly string[]`.
- `@lakeql/file-generator`: the generated resolver calls `readStrategy.read<NodeInterface>(...)` so results are typed as the concrete connection, and no longer imports an unused `TableDefinition`.
- `@lakeql/sql-read-strategy`: read results now expose the full page-info shape.

Generated projects must depend on `@lakeql/query-builder` (the starter template now includes it).
