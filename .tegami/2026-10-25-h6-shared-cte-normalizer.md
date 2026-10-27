---
packages:
  "@lakeql/response-transformer":
    type: minor
---

### Add shared CTE response-normalizer factory

`@lakeql/response-transformer` now exports `createCteResponseNormalizer`, the shared implementation behind the Trino and Fabric response normalizers. Both adapters previously carried a near-identical ~195-line copy of the CTE decoding (total-count extraction, synthetic-row filtering, date conversion); they now build on the factory and inject only the adapter-specific sentinel predicate (Trino accepts `true`; Fabric accepts `true` or `1`). Normalizer behavior is unchanged.
