---
packages:
  "@lakeql/query-builder":
    type: major
  "@lakeql/adapter-trino":
    type: major
  "@lakeql/sql-read-strategy":
    type: major
  "@lakeql/adapter-fabric":
    type: minor
---

### Generic query-builder with adapter-injected dialects

`@lakeql/query-builder` no longer contains adapter-specific code. The `generateQuery()` function now accepts a `dialect: QueryDialect` parameter instead of `adapter: AdapterType`. The `QueryDialect` interface defines Kysely components (adapter, compiler, introspector) and adapter-specific SQL helpers (timestamp conversion, pagination, identifier quoting). `formatQuery()` accepts an optional `language` string instead of `adapter`.

### Kysely-based Trino dialect in adapter-trino

The hand-rendered SQL dialect (450+ lines) in `@lakeql/adapter-trino` has been replaced with a ~40-line Kysely-based implementation using `PostgresAdapter`, `PostgresQueryCompiler`, and `PostgresIntrospector`. The adapter now exports `trinoDialect` implementing the new `QueryDialect` interface.

### sql-read-strategy uses Kysely query builder

`@lakeql/sql-read-strategy` now calls `generateQuery()` from `@lakeql/query-builder` internally with the injected `QueryDialect`, instead of calling `dialect.buildQuery()`. The `SqlReadStrategyConfig.dialect` field expects the new Kysely-based `QueryDialect`.

### New adapter-fabric package

`@lakeql/adapter-fabric` provides a Fabric/T-SQL adapter following the same architecture as adapter-trino: `AdapterFactory`, `AdapterDefinition`, Kysely-based `MssqlDialect`, `ResponseNormalizer`, and `FabricDataSource` implementing the neutral `DataSource` contract.
