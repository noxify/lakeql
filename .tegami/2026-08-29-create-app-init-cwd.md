---
packages:
  "@lakeql/create-app":
    type: patch
---

### Resolve relative paths from where the command was run

Relative `--local` and `--target-dir` paths now resolve against the directory you invoked the command from, not the package directory. When running through a package-manager script (for example `pnpm --filter @lakeql/create-app dev`), the process starts inside the package, which previously made relative paths resolve to the wrong place. The CLI now prefers the package manager's `INIT_CWD`, so

```bash
create-lakeql-app my-app --local ./templates/app -d ./examples
```

works as expected from the repository root. The printed "Created" and "cd" paths are relative to that same directory.
