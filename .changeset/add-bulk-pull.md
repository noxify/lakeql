---
"@lakeql/cli": minor
---

Add bulk pull mode (`--bulk`) to the `pull` command for importing multiple schemas and tables from a single config file.

- New `--bulk` flag enables bulk mode
- New `--bulk-config <path>` option to specify config file (default: `import.config.mjs`)
- Config file is an ES module exporting an array of `{ schema, tables?, views?, catalog? }` entries
- Schema entries are processed in parallel using `listr2`
- Catalog precedence: CLI flag > config entry > ENV variable
- Config registry is generated once at the end (not per entry)
- Exports `BulkPullConfig`, `BulkPullEntry`, and `LakeQLConfig` types for type-safe config files
- Replaces `ora` with `listr2` for structured terminal output
- Extracts reusable `executePull` action from the pull command
- Migrates config loading to [c12](https://github.com/unjs/c12) — supports `.mjs`, `.ts`, `.js`, `.json` formats
- `lakeql.config.mjs` now takes precedence over `lakeql.config.json`
- `init` command now lets you choose between `.mjs` (recommended) and `.json` format
