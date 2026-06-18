---
"@lakeql/cli": patch
---

Improve `pull` command UX by adding explicit progress and completion messages for successful runs.

- Print a visible start message before generation begins.
- Print a clear success summary after files are generated, including item count and target path.
- Update CLI pull documentation examples to reflect the new output.
- Add test coverage for the new pull command output messaging.
