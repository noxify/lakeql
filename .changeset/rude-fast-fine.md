---
"@lakeql/cli": minor
---

Add `generate-import-config` command to generate an `import.config.mjs` from already-pulled schemas.

- scans `schemas/generated/<catalog>/<schema>/<table>/` and builds a ready-to-use bulk pull config
- previews the generated config in the terminal before writing
- prompts for confirmation before writing; warns and asks for overwrite confirmation when file already exists
- `--force` flag skips confirmation and overwrites without prompting
- `--output <path>` to customise the output file (default: `import.config.mjs` in the invocation directory)
