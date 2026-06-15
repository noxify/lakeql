---
"@lakeql/create-app": patch
---

Fix `workspace:*` dependencies not being resolved to registry versions in scaffolded projects. Replaced `read-pkg` (which stripped non-semver ranges via normalization) with direct JSON file reading. Also added `@lakeql/adapters` to the template for mutation support.
