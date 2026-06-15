---
"@lakeql/cli": patch
---

Stop generating `mutation-schema.ts` when no `mutation` config is present in the endpoint definition. Previously, omitting the `mutation` field would still produce a placeholder resolver.
