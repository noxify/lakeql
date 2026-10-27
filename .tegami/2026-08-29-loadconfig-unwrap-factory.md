---
packages:
  "@lakeql/config":
    type: patch
---

### Fix runtime construction from loaded config

`loadConfig()` now unwraps each registered `AdapterDefinition` to its underlying `AdapterFactory`. `defineConfig()` registers definitions (which hold the factory under a `factory` property), but `createLakeQLRuntime()` consumes bare factories. Passing the loaded adapters straight through previously threw `createDataSource is not a function` at runtime. Entries that are already factories are passed through unchanged.
