---
"@lakeql/schema-generator": minor
"@lakeql/adapters": minor
"@lakeql/cli": patch
"@lakeql/file-generator": patch
---

Add configurable partitioning support for write pipelines

- Introduce `partitioning` and `partitioningFormat` options to mutation config
- Support timestamp-based (default), field-based, custom format, and disabled partitioning modes
- Add validation for custom partition format strings with date component extraction
- Enrich schema and records with `load_timestamp` for timestamp-based partitioning
- Generate flat paths when partitioning is disabled
- Group records by partition field or custom format segments
- Wire partitioning config through CLI generation and file-generator output
