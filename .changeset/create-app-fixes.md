---
"@lakeql/create-app": patch
---

Fix `workspace:*` dependencies not being resolved to registry versions. Replace `read-pkg` with direct JSON file reading to avoid normalization stripping non-semver ranges. Generate `pnpm-workspace.yaml` during scaffolding to allow esbuild build scripts. Add `@lakeql/adapters` to template. Add project README.
