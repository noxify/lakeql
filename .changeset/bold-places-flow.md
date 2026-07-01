---
"@lakeql/file-generator": patch
---

Fix query schema generation so `transformFields` no longer emits duplicate object keys for repeated mappings, and type generated empty `transformFields`/`dateFields` constants explicitly to avoid TypeScript inference errors.
