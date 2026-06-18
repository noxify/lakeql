---
"@lakeql/cli": patch
---

Show compact live per-item progress for bulk pull entries with more than 10 tables or views, cap total bulk pull concurrency at 8 operations by default, and add a `--concurrency` option so both bulk and non-bulk multi-item pulls can tune that limit.
