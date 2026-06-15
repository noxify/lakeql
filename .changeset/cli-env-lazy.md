---
"@lakeql/cli": patch
---

Fix env validation still triggering for non-Trino commands after bundling. Replace eager `createEnv()` with lazy `getEnv()` that only validates when called. Use Commander's `.env()` for catalog option fallback. Remove unused `--no-interactive` flag from `create-endpoint`. Add `--force` flag to skip overwrite confirmation.
