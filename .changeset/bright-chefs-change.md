---
"@lakeql/schema-generator": minor
"@lakeql/trino-client": minor
"@lakeql/create-app": minor
"@lakeql/api": minor
"@lakeql/cli": minor
---

Add mutation pipeline support across the LakeQL stack.

- **schema-generator**: Extend endpoint definition schema with optional `mutation` config (load strategy + base path) and per-field `options` (required, validations)
- **cli**: Generate working mutation resolvers that invoke the write pipeline, generate Zod validation schemas from field options, display mutation config in `create-endpoint` summary, set `mutation: false` for pulled endpoints
- **api/trino-client/create-app**: Dependency updates to support the new write pipeline integration
