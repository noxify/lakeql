---
packages:
  "@lakeql/api":
    type: minor
  "@lakeql/cli":
    type: patch
---

### Write strategy available on the GraphQL context

The API GraphQL context now exposes `getWriteStrategy(name)` alongside `getReadStrategy(name)`, delegating to the configured runtime's `getWriteStrategy`. It is `undefined` when the API is configured without a runtime, mirroring the read bridge.

### Generated mutation resolvers use the runtime write strategy

The CLI codegen for mutation endpoints no longer emits an inline `TrinoClient`, `HIVE_*` environment reads, or `executeWritePipeline`/`hiveConfig`. Generated mutation resolvers now call `context.getWriteStrategy(sourceConfig.dataSource).write({ records, schema, config })`, building the write config from `sourceConfig` and `storageConfig`. This fixes previously uncompilable generated mutation output and aligns it with the runtime/write-strategy architecture.
