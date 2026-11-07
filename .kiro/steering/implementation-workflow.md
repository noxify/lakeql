# LakeQL Implementation Workflow

## Command Policy

Use the repository's local package manager and scripts.

- Use `pnpm` scripts from the root or affected package.
- Use `pnpm --filter <package> <script>` for focused package checks.
- Use `pnpm exec <tool>` when no suitable repository script exists.
- Do not use `npx` for formatting, linting, typechecking, building, or tests.
- Do not use globally installed `oxfmt`, `oxlint`, `tsc`, `turbo`, or `vitest` when a repository script or local executable is available.

## Preferred Commands

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test -- --run
```

For a package:

```bash
pnpm --filter @lakeql/<package> typecheck
pnpm --filter @lakeql/<package> test -- --run
pnpm --filter @lakeql/<package> build
```

Use the actual package name and only scripts that exist in its `package.json`. Package tests are run with `-- --run` so Vitest does not enter watch mode.

## Validation Scope

Validate the surface you actually changed, and no more:

- For a package change, run that package's checks (`pnpm --filter @lakeql/<package> typecheck | test -- --run | build`).
- For an app, template, tooling, workspace-config, or CI change, run the narrowest relevant check for that surface (e.g. `pnpm --filter docs build` for the docs app, a YAML parse for a workflow file).
- When a change spans several packages, the package-wide checks are:

```bash
pnpm --filter "./packages/*" typecheck
pnpm --filter "./packages/*" build
pnpm --filter "./packages/*" test -- --run
pnpm exec oxfmt --check packages
pnpm exec oxlint packages
```

Do not pull unrelated surfaces into a change's validation. If a change genuinely requires touching more than its primary surface, state the reason and run the narrowest relevant check for each additional surface.

## Focused Validation

After editing a package, validate in this order:

1. package diagnostics, if available;
2. package `typecheck`;
3. focused package test;
4. package `build` when exports or package boundaries changed;
5. root formatting and lint checks before integration.

For a direct local tool invocation, use:

```bash
pnpm exec oxfmt --check <paths>
pnpm exec oxlint <paths>
pnpm exec tsc --noEmit -p <tsconfig>
pnpm exec vitest run <test-file>
```

## Editing and Scope

- Do not reformat unrelated files.
- Do not modify package READMEs with duplicated feature documentation.
- Keep package READMEs short; complete documentation belongs in `apps/docs` after the package APIs are stable.
- Keep changes inside the active feature scope.
- If a public interface or package dependency outside the scope is required, stop and report the architectural dependency before editing.

## Spec and Branch Discipline

- Keep one feature scope per branch; derive a descriptive branch name from the task.
- For a non-trivial feature, complete its `design.md`, `requirements.md`, and `tasks.md` before coding; small, well-scoped changes do not require a spec.
- Base a feature branch on the branch it will integrate into, and integrate back through that same branch.
- Do not add shims, deprecated aliases, re-exports, or fallback paths for backward compatibility unless an active design explicitly requires it.
- Update tasks and record validation results before declaring a slice complete.

## Release Notes and Tegami

At feature-slice completion, determine whether the change is release-relevant:

- Create a pending `.tegami/YYYY-MM-DD-{hash}.md` changelog file when the slice changes a published package's public API, runtime behavior, CLI behavior, or user-facing functionality.
- Include every affected package in the Tegami frontmatter and write a concise user-facing note under a Markdown heading.
- Do not create a changeset for internal-only tests, documentation-only work, architecture notes, or refactors with no published behavior change.
- Do not edit package `CHANGELOG.md` files or `.tegami/publish-lock.yaml` directly.
- Follow the repository rules in `AGENTS.md` and use the Tegami file format documented there.

Release-note creation is part of feature completion, but version selection and publishing remain a separate release workflow.
