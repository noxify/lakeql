---
"@lakeql/file-generator": patch
"@lakeql/schema-generator": patch
---

Hardened the generators by adding an explicit root-model guard, making mutation config handling treat empty mutation lists as disabled, and switching JSON schema generation to fail fast instead of silently swallowing invalid field definitions.
