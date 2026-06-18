---
"@lakeql/cli": patch
---

Fix config loading when using `lakeql.config.json` on Node.js 24 with ESM.

When `c12` fails with `ERR_IMPORT_ATTRIBUTE_MISSING` for JSON config imports,
`@lakeql/cli` now falls back to reading `lakeql.config.json` directly and still
applies default config values.

The CLI also exits successfully when invoked without arguments, printing the
top-level help instead of treating the missing command as an error.

Other config loading errors are still rethrown unchanged.
