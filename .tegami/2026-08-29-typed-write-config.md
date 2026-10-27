---
packages:
  "@lakeql/config":
    type: minor
  "@lakeql/adapter-trino":
    type: minor
---

### Per-adapter typing for `writeConfig` in `defineConfig`

`@lakeql/config` now infers the `writeConfig` type of each data-source entry from its adapter. `AdapterDefinition` gains a fourth generic `TWriteConfig` (defaulting to `never`) and an optional `validateWriteConfig(config): asserts config is TWriteConfig` member that pins the type. An adapter that declares no write validator makes `writeConfig` accept only `undefined` at the call site, while an adapter that declares one narrows `writeConfig` to its own union.

This is additive and backward compatible: existing three-argument `AdapterDefinition` references and definitions without a write validator keep working. The change tightens the `defineConfig` call site, so a previously ill-typed `writeConfig` may now surface a type error.

### Trino `writeConfig` is now type-checked at the config call site

`@lakeql/adapter-trino`'s `trinoAdapterDefinition` now declares `validateWriteConfig`, so a Trino data source in `defineConfig` gets full completion and checking for `writeConfig` against the `TrinoWriteConfig` union (`strategy: "storage" | "insert"` and the per-strategy fields). Runtime validation is unchanged; this adds the compile-time layer on top.
