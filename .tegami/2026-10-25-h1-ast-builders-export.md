---
packages:
  "@lakeql/file-generator":
    type: minor
---

### Expose the `ast-builders` subpath

`@lakeql/file-generator` now publishes its TypeScript AST builder helpers under the `@lakeql/file-generator/ast-builders` subpath (for example `id`, `stringLiteral`, `objectLiteral`, `methodCall`, `importNames`). The CLI's mutation-schema pipeline now consumes these shared helpers instead of a local copy.
