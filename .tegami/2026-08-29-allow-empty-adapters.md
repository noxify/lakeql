---
packages:
  "@lakeql/config":
    type: minor
---

### `defineConfig` accepts an empty `adapters` array

`defineConfig({ adapters: [], dataSources: {} })` is now valid instead of throwing. This represents an "empty but runnable" project config — no adapters and no data sources configured yet — which is the natural starting state for a freshly scaffolded app. All other input checks are unchanged: a missing or non-array `adapters`, a null/non-object adapter entry, and invalid `dataSources` still throw. Data-source entries continue to require a matching registered adapter, both at the type level and at runtime (`UnknownAdapterError`).
