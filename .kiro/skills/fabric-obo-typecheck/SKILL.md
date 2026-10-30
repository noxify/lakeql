---
name: fabric-obo-typecheck
description: Manually verify that the fabric-obo scaffold feature's printed guidance produces a type-checking Fabric app. Scaffolds a throwaway app with create-app, applies `add fabric-obo` via the real CLI, confirms it does NOT type-check yet, follows the printed guidance edits, then confirms it does. Needs the project's dependency types installed (@azure/identity, zod, @t3-oss/env-core, @lakeql/config), which no CI job installs and never will. Manual runbook only — nothing here runs in CI.
---

# fabric-obo — manual typecheck runbook

A step-by-step runbook that proves the `fabric-obo` scaffold feature's printed guidance is correct and complete: scaffold a throwaway Fabric app, apply `add fabric-obo`, confirm the project does **not** type-check yet, follow the two printed guidance edits by hand, then confirm it does.

This is a **manual check**, not an automated test. It lives under `.kiro/skills/` as prose + commands and has zero CI footprint, mirroring `.kiro/skills/trino-mutation-e2e/SKILL.md`. Do not convert it into a `*.test.ts` under `packages/`.

## Why manual

The automated E2E test (`packages/scaffold/tests/fabric-obo.e2e.test.ts`) exercises the real `create-lakeql-app` + `lakeql-cli add fabric-obo` flow and asserts on the resulting files and printed guidance text, but it never runs `tsc` against the scaffolded project. Type-checking needs the project's dependency types installed (`@azure/identity`, `zod`, `@t3-oss/env-core`, `@lakeql/config`), and no CI job installs a scaffolded example — nor will it ever, since `examples/*` is git-ignored and exists only for local/manual use. This skill is that missing manual check.

## Prerequisites

- Packages built: `pnpm --filter "./packages/*" build` (or at least `pnpm --filter @lakeql/create-app build` and `pnpm --filter @lakeql/cli build`).
- `pnpm install` has been run at the repo root.
- Free disk for a throwaway app under `examples/` (git-ignored except `.gitkeep`).

## 1. Pre-flight cleanup

Safe no-op on a clean machine:

```bash
rm -rf examples/fabric-obo-typecheck-smoke
```

## 2. Scaffold a throwaway Fabric app

```bash
node packages/create-app/dist/index.mjs fabric-obo-typecheck-smoke \
  --adapters fabric --ds-names fabric --auth mock \
  --target-dir examples --local --no-install --quiet

pnpm install   # link the new workspace app's deps
```

> If `packages/create-app/dist/index.mjs` is missing, build it first: `pnpm --filter @lakeql/create-app build`. Likewise build the CLI once: `pnpm --filter @lakeql/cli build`.

The template's `tsconfig.json` already includes `lakeql.config.ts` in `"include"` (alongside `"src"`), so no tsconfig edit is needed — `tsc` checks the config file by default.

## 3. Apply `add fabric-obo`, then reinstall

The feature adds `@azure/identity` to `package.json`; reinstall so its types are actually present before type-checking:

```bash
cd examples/fabric-obo-typecheck-smoke
pnpm exec lakeql-cli add fabric-obo
cd ../..
pnpm install
cd examples/fabric-obo-typecheck-smoke
```

Expect output resembling:

```
✔ Applied feature "fabric-obo"
Changes
  • added dependencies @azure/identity@4.14.1
  • appended env OBO_CLIENT_ID to .env.example
  • appended env OBO_CLIENT_SECRET to .env.example
  • appended env OBO_FABRIC_SCOPE to .env.example
  • appended env OBO_TENANT_ID to .env.example
  • created src/fabric-impersonation-resolver.ts
Next steps
 1. Add these entries to the `server: { … }` object in src/env.ts:
      OBO_CLIENT_ID: string().min(1),
      OBO_CLIENT_SECRET: string().min(1),
      OBO_FABRIC_SCOPE: string().default("https://database.windows.net/.default"),
      OBO_TENANT_ID: string().min(1),
 2. Add this import to lakeql.config.ts:
      import { fabricImpersonationResolver } from "./src/fabric-impersonation-resolver"
 3. Attach the resolver to each of your Fabric data sources in lakeql.config.ts
    by adding this property:
      impersonationResolver: fabricImpersonationResolver,
... (follow-up Azure steps 4-7, unchanged, not relevant to type-checking)
```

## 4. Confirm it does NOT type-check yet

The resolver references env keys `src/env.ts` does not declare yet:

```bash
pnpm exec tsc --noEmit
```

Expect 4 `TS2339` errors in `src/fabric-impersonation-resolver.ts`, one each for `OBO_TENANT_ID`, `OBO_CLIENT_ID`, `OBO_CLIENT_SECRET`, `OBO_FABRIC_SCOPE`.

## 5. Follow the printed guidance — edit 1 (`src/env.ts`)

Add the four lines printed in step 3 to the `server: { … }` object:

```ts
    OBO_CLIENT_ID: string().min(1),
    OBO_CLIENT_SECRET: string().min(1),
    OBO_FABRIC_SCOPE: string().default("https://database.windows.net/.default"),
    OBO_TENANT_ID: string().min(1),
```

## 6. Follow the printed guidance — edit 2 (`lakeql.config.ts`)

Add the import, near the existing `env` import:

```ts
import { fabricImpersonationResolver } from "./src/fabric-impersonation-resolver"
```

Attach the resolver on the `fabric` data source entry:

```ts
    fabric: {
      adapter: "fabric",
      impersonationResolver: fabricImpersonationResolver,
      connection: {
        /* ...unchanged... */
      },
    },
```

## 7. Confirm it type-checks now

```bash
pnpm exec tsc --noEmit
```

Expect no output, exit code `0`.

## 8. Cleanup

```bash
cd ../..
rm -rf examples/fabric-obo-typecheck-smoke
```

A `pnpm install` run against the (now-deleted) throwaway app can leave a stray `pnpm-lock.yaml` diff behind. If `git status` shows `pnpm-lock.yaml` modified afterward with no other changes intended, run `git checkout -- pnpm-lock.yaml` to revert it.

## Notes and gotchas

- **Why step 3 reinstalls before step 4.** `add fabric-obo` only edits `package.json`; the `@azure/identity` package itself (and its types) is not on disk until the next `pnpm install`. Skipping the reinstall makes the pre-guidance type-check fail for the wrong reason (missing module, not missing env keys).
- **The template's `tsconfig.json` already checks `lakeql.config.ts`** (its `"include"` is `["src", "lakeql.config.ts"]`), so no tsconfig edit is needed before type-checking.
- **`examples/fabric-obo-typecheck-smoke` is git-ignored** (`examples/*`), so nothing in this runbook is committed; recreate it from this runbook whenever you need to re-verify.
- **Resolve `tsc` via `pnpm exec`**, never a hardcoded path into an example's `node_modules` — that path never exists in CI and is exactly the problem this skill replaces.
