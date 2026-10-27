---
packages:
  "@lakeql/cli":
    type: minor
---

### Load environment variables with `--env`

The CLI accepts a global `--env [path]` option that loads variables from a file into the environment before `lakeql.config.ts` is evaluated, so a config referencing `env.*` resolves its values. Behavior:

- without `--env`: nothing is loaded (the existing environment is used as-is);
- `--env` without a value: loads the default `.env`;
- `--env <path>` / `--env=<path>`: loads that file (relative paths resolve against the invocation directory).

It uses Node's built-in `.env` parser (no third-party dotenv dependency). Passing `--env` with a missing or unreadable file is a hard error.

This replaces the broken scaffolded script `node --env-file=.env lakeql-cli`, which never resolved the installed binary and failed with `Cannot find module '…/lakeql-cli'`. Generated projects now use `lakeql-cli --env=.env`.
