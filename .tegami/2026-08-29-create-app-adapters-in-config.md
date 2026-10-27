---
packages:
  "@lakeql/create-app":
    type: patch
---

### Generated config now registers the selected adapters

Scaffolded projects previously generated a `lakeql.config.ts` with only `sourcePath` and `dataSources`, omitting the required `adapters` registration. Against the current `@lakeql/config` that config fails (`defineConfig` needs an `adapters` array, and unregistered adapters raise `UnknownAdapterError` at runtime).

`create-lakeql-app` now imports each selected adapter's definition and registers it, e.g. for a Trino selection it emits `import { trinoAdapterDefinition } from "@lakeql/adapter-trino"` and `adapters: [trinoAdapterDefinition]`, so a freshly scaffolded app runs against the current runtime.
