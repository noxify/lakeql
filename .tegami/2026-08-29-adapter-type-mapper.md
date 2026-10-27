---
packages:
  "@lakeql/datasource":
    type: minor
  "@lakeql/adapter-trino":
    type: minor
  "@lakeql/adapter-fabric":
    type: minor
  "@lakeql/cli":
    type: patch
---

### Adapter-neutral type mapping on the DataSource contract

`@lakeql/datasource` gains a `TypeMapper` contract and a `PrimitiveType` union, and every `DataSource` now exposes a `readonly typeMapper`. A `TypeMapper` converts between an adapter's engine-specific type strings and LakeQL's canonical primitive types in both directions (`toPrimitiveType`, `toEngineType`).

### Trino and Fabric type mappers

`@lakeql/adapter-trino` exports `TrinoTypeMapper` / `trinoTypeMapper`, and `@lakeql/adapter-fabric` exports `FabricTypeMapper` / `fabricTypeMapper`. Each data source wires its mapper into `dataSource.typeMapper`, so callers can map column types without knowing the underlying engine.

### CLI codegen uses the adapter's type mapper

The CLI pull/codegen pipeline no longer hardcodes Trino type mapping. It now maps column types through the active data source's `typeMapper`, so pulling from Fabric produces correct LakeQL primitive types (e.g. `nvarchar` → `String`, `bit` → `Boolean`, `datetime2` → `DateTime`). Existing Trino pulls are unaffected.
