---
packages:
  "@lakeql/create-app":
    type: patch
---

### Smoother local-mode scaffolding

Running `create-lakeql-app --local` no longer asks whether to install dependencies or which package manager to use. In local mode the surrounding monorepo owns installation, so those answers were never applied — the prompts are now skipped.

Scaffolding failures also surface the real cause (for example, a missing local template directory) instead of a generic "Something went wrong" message, and exit with a non-zero status.
