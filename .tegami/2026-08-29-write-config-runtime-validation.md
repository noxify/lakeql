---
packages:
  "@lakeql/config":
    type: minor
---

### Validate writeConfig at config-load time

`defineConfig()` now validates a data source's `writeConfig` while processing the config, right after it validates the connection, when the adapter provides a `validateWriteConfig` assertion. An invalid `writeConfig` (for example a Trino source with an unknown write `strategy`) is rejected up front with a `DataSourceConfigError` that names the offending data source and adapter, instead of surfacing later when the write strategy is constructed.

Validation runs against the post-merge `writeConfig`, so values produced by a custom `mergeDataSourceConfig` are covered too. Adapters that declare no `validateWriteConfig` continue to pass `writeConfig` through unchanged, and the adapter-side validation in `createWriteStrategy` is retained as defense in depth.
