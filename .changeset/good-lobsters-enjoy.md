---
"@lakeql/cli": patch
"@lakeql/logger": patch
"@lakeql/schema-generator": patch
---

Improve CLI pull UX and harden code generation/error handling.

- fix CLI argument parsing so `pull` executes instead of showing help
- improve CLI error rendering with clearer contextual messages
- remove implicit dotenv loading from CLI runtime (environment must be provided by caller)
- add interactive pull task progress and generate config registry once per run
- expand logger console helpers with `info` and `warning`
- harden schema generation for invalid field names by central normalization in schema-generator
- add/adjust regression tests for pull output and identifier handling
