---
"@lakeql/cli": minor
---

Improve CLI reliability, command execution, and user-facing diagnostics.

- Fix command argument parsing so direct subcommands (for example `pull`) execute correctly instead of falling back to help output.
- Add structured top-level CLI error handling with headline, reason, error code, root cause and actionable hints.
- Handle user aborts consistently as non-error exits (`exitCode: 0`) and render them as warnings.
- Introduce typed CLI errors (`CliError`) to keep command failures consistent across commands.
- Add Trino request context to failures in `pull`, `list-schemas`, `list-tables`, `list-views` and `list-columns`.
- Validate bulk pull config entries strictly (each entry must define `schema` and at least one non-empty `tables` or `views` list).
- Remove implicit `.env` loading from the CLI runtime so environment injection is explicit and standalone-friendly.
