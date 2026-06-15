---
"@lakeql/cli": patch
---

Defer env validation to commands that actually need Trino access. Commands like `create-endpoint`, `config-registry`, and `init` no longer require a valid `.env` file to run. Use Commander's `.env()` for catalog option fallback. Remove unused `--no-interactive` flag from `create-endpoint`.
