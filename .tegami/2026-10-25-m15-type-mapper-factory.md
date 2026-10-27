---
packages:
  "@lakeql/datasource":
    type: minor
  "@lakeql/adapter-trino":
    type: major
  "@lakeql/adapter-fabric":
    type: major
---

### Shared `createTypeMapper` factory

`@lakeql/datasource` now exports `createTypeMapper`, which builds a `TypeMapper` from two lookup records (engine→primitive and primitive→engine). It normalizes engine types before the lookup (strips parameters, lowercases, trims) and falls back to `"String"` for unknown engine types.

### Type mappers are singletons, classes removed

`@lakeql/adapter-trino` and `@lakeql/adapter-fabric` now build their type mappers with the shared `createTypeMapper` factory instead of bespoke classes. The singletons `trinoTypeMapper` and `fabricTypeMapper` are unchanged in behavior and remain exported. The `TrinoTypeMapper` and `FabricTypeMapper` classes are no longer exported; import the singleton instead of constructing an instance.
