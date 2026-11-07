---
inclusion: auto
globs: packages/**/*.ts
---

# Code Comment Conventions (packages)

Keep comments and JSDoc in `packages/**/*.ts` clean and reader-oriented. Write comments that help a human understand non-obvious code, and nothing else.

## Do not reintroduce spec-generation artifacts

Earlier code generation left machine-oriented traceability text in comments. That has been removed on purpose. Do NOT write any of the following into package TypeScript files (source or tests):

- Decorative banners drawn from box-drawing characters (for example lines of `═`). Plain dashed dividers like `// --- Helpers ---` are fine.
- Spec-traceability JSDoc lines such as `Validates: Requirements 9.3, 9.4` or `Verifies: P22 (...)`.
- Provenance lines such as `// Feature: some-feature, Property 4: ...`.
- Numbered `Property N:` labels in `describe`/`it`/`test` titles, in comment header lines, or in banner titles. Use the descriptive part only — write `describe("Configuration validation completeness", ...)`, not `describe("Property 2: Configuration validation completeness", ...)`.
- Inline requirement references like `Requirement 1.4`, `Req 3.5`, `(Req 13.2)`, or `(P14)` in prose, comments, or title suffixes.

The word `Property-based` (as in "property-based tests") is fine — the rule only targets a `Property` immediately followed by a number.

## Prefer

- Clean JSDoc: a short summary, `@param`/`@returns`/`@throws`/`@template` where they add contract information beyond the type signature.
- Comments that explain WHY non-obvious code exists, not WHAT a spec numbered it.
- Descriptive `describe`/`it`/`test` titles that read as behavior statements.

RFC-2119-style prose (`SHALL`, `MUST`), `Invariant:` lead-ins, and other genuinely explanatory text are welcome when they clarify behavior.
