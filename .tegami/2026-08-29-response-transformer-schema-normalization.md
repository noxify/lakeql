---
packages:
  "npm:@lakeql/response-transformer": minor
  "npm:@lakeql/sql-read-strategy": patch
---

### Adapter-neutral schema-aware record transformation

`@lakeql/response-transformer` now exports `transformRecords`, an adapter-neutral function that walks keyed records against a schema: it transforms nested objects and arrays, applies source→target field mapping at every level, normalizes null-ish scalars, and drops fields absent from the schema. Date/timestamp decoding stays with the adapter normalizer, so the transformer never fabricates a timezone or offset.

The legacy `transform`, `transformArray`, `transformObject`, and `convertTrinoResponse` exports and the `@formkit/tempo` dependency have been removed.

`@lakeql/sql-read-strategy` now runs `transformRecords` on normalized records before returning them, so the read path produces schema-shaped results.
