---
packages:
  "@lakeql/api":
    type: patch
---

### Clearer error when no schema files exist

When the server finds no generated schema files, the error now explains how to fix it: run the pull command to generate schemas from your data sources, or set `schemaPath` in `defineApiConfig` if they live elsewhere. Previously the message only listed the glob patterns it checked, which was confusing in a freshly scaffolded project that has not run a pull yet.
