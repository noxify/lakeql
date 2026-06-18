---
"@lakeql/cli": patch
---

Fix config loading when using `lakeql.config.json` on Node.js 24 with ESM.

When `c12` fails with `ERR_IMPORT_ATTRIBUTE_MISSING` for JSON config imports,
`@lakeql/cli` now falls back to reading `lakeql.config.json` directly and still
applies default config values.

Other config loading errors are still rethrown unchanged.
