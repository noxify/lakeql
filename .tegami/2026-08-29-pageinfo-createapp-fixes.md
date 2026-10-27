---
packages:
  "@lakeql/api":
    type: minor
  "@lakeql/create-app":
    type: patch
  "@lakeql/cli":
    type: patch
  "@lakeql/adapter-trino":
    type: patch
---

### Validate column types at all DDL sites

Column type strings are now sanitized before being interpolated into `CREATE TABLE` DDL at every site. Previously the Hive table manager and the INSERT write strategy interpolated the caller-supplied `type` string raw, while only `DataSource.createTable` validated it — so a type like `VARCHAR) WITH (…)` supplied through the public `ManagedTableDefinition.columns` contract could break out of the type position. A new `sanitizeColumnType` guard rejects control characters, SQL comment markers, semicolons, unbalanced parentheses, and any character outside a composite-type-safe allowlist, while still allowing legitimate composite types such as `ARRAY(...)` and `ROW(...)`.

### Fix list-schemas connection leak

`lakeql-cli list-schemas` now closes the data-source connection even when catalog resolution fails. Previously catalog resolution ran outside the cleanup block, so a failure there (it makes a network call) leaked the connection. Matches the cleanup already present in `list-tables` and `list-views`.

### Fix permission scope matching (fail closed)

Permission rule matching no longer ignores a rule's `catalog`/`schema` scope when the request target omits those fields. Previously a rule scoped to a specific catalog/schema would match a target that carried neither, silently widening the rule's scope. A rule that names a `catalog` or a concrete `schema` now only matches a target with the same value. Targets that supply catalog and schema (every current adapter path) are unaffected.

### Fix schema discovery when schemaPath is omitted

When `defineApiConfig` was called without a `schemaPath`, schema discovery searched inside the installed `@lakeql/api` package directory and could only ever throw `SchemaFilesNotFoundError`. It now searches the consumer's `baseDir` (falling back to the current working directory), matching the behavior when `schemaPath` is supplied.

### Configurable CORS and a working health check

`defineApiConfig` accepts a new `cors` option that configures CORS for the GraphQL route (Hono CORS middleware options). CORS is now **off by default** — previously the server hard-coded `origin: "*"` with `credentials: true`, a pairing browsers reject and that could not be restricted. Set `cors.origin` to the front-ends allowed to call the API.

The health check endpoint (`healthCheckEndpoint`, default `/live`) is now served by the HTTP layer and returns `200`. Previously it was mounted only inside the GraphQL route and returned `404`, breaking readiness/liveness probes.

### Fix swapped PageInfo nextPage/previousPage descriptions

The generated GraphQL `PageInfo` type had its `nextPage` and `previousPage` field descriptions swapped — `nextPage` described going to the previous page and vice versa. The descriptions now match the fields.

### Fix create-app next-steps pull hint

The scaffolder's printed next steps suggested `cli pull --target ./src`, but `pull` has no `--target` option. It now prints the correct `--source-path ./src`.
