---
packages:
  "@lakeql/create-app":
    type: patch
---

### Generate valid data source config

Scaffolded `lakeql.config.ts` files now nest adapter connection fields under a `connection` key, matching the `defineConfig` data source shape. Previously the fields (`auth`, `host`, `catalog`, …) were emitted flat on the data source, which produced a TypeScript error (`'auth' does not exist in type …`) in the generated project. Affects the Trino and Fabric adapter templates.
