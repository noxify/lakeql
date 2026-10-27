---
packages:
  "@lakeql/create-app":
    type: minor
---

### Add `--local [path]` for scaffolding from a local template

`create-lakeql-app` gains a `--local [path]` flag for contributor/dev workflows. In local mode the starter is copied from a local template directory instead of being downloaded from GitHub (default `<cwd>/templates/app`; a path argument overrides it), and the generated project keeps its `workspace:*` dependency versions instead of resolving them to npm — so it runs against local monorepo packages. Default (remote) behavior is unchanged.

### Fix `--adapters` rejecting multiple comma-separated ids

`--adapters trino,fabric` previously failed because the option validated the whole comma-joined string against a single allowed choice. The choice constraint is removed from the flag (ids are still validated individually), so selecting multiple adapters via the flag now works. Generated `lakeql.config.ts` formatting was also tidied to consistent indentation.
