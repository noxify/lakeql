# Release workflow

This repository uses [Tegami](https://tegami.fuma-nama.dev) for versioning and publishing.

## Write changelog files

Create pending changelog files under `.tegami/` as `YYYY-MM-DD-{hash}.md`.

See the [changelog format docs](https://tegami.fuma-nama.dev/changelog) for details.

### Example

```md
---
packages:
  "npm:@acme/ui": patch
---

### Fix button hover state

The hover color now matches the design system.
```

### Package references

Use package names, ids, or groups in frontmatter. For example:

- `"@acme/ui"` — package name
- `"npm:@acme/ui"` — package id
- `"group:acme"` — every package in a group

Rules:

- Include YAML frontmatter with `packages`
- Include at least one `#`, `##`, or `###` heading in the body
- Write user-facing release notes under each heading
- Do not edit the publish lock file (`.tegami/publish-lock.yaml`) or package `CHANGELOG.md` files directly

## TypeScript source conventions

- Use extensionless relative import and export specifiers in TypeScript source files (for example, `from "./adapter"`, not `from "./adapter.js"`). Package build tooling owns emitted file extensions.
- Treat every public export as API-reference material. Provide a summary JSDoc comment and document public members whose purpose is not obvious from their type.
- For public generic declarations and generic callable members, use `@template` to explain each type parameter. Use `@param`, `@returns`, and `@throws` where they explain a public call contract beyond its TypeScript signature.
