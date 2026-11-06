---
inclusion: auto
globs: packages/**/*.{ts,json},apps/docs/content/**/*.mdx,templates/**/*.{ts,json}
---

# No real-world identifiers in tests, fixtures, or docs

This is a public OSS repository. Test data, fixtures, SQL snapshots, example configs, and documentation must never contain real schema, table, catalog, column, field, or workspace names from any actual deployment. Use neutral, obviously-generic placeholders instead. Once a real name lands in a committed file it is also in the public git history, which is costly to scrub.

## Rules

- Do NOT use real database/warehouse identifiers (schema, table, catalog, column/field, data-source, or workspace names) taken from a production or internal system. Treat any identifier that looks organization-specific or domain-jargon as suspect and replace it with a generic one.
- DO use clearly-generic placeholders. Prefer the house examples already used across the docs and tests so everything stays consistent:
  - schema: `analytics_sales`, `demo_sales`, `analytics`
  - table: `order_line_items`, `dummy_table`
  - catalog: `hive`, `reporting_lh`
  - fields/columns: `order_id`, `status`, `active`, `string_field`, `number_field` (and camelCase equivalents where the code expects them)
  - data source: `warehouse`, `reporting`, `trino_source`
- Example `namePrefix` values in docs/tests should be generic data-source-style words (e.g. `"warehouse"`), not adapter names or real prefixes.
- This applies to every artifact a reader or crawler can see: unit/integration test inputs AND their expected-output strings (e.g. generated SQL, generated type/query/mutation names), JSON fixtures, `.mdx` docs and worked examples, and template/scaffold files.
- Secrets, credentials, tokens, real hostnames, and real tenant/account IDs are never allowed in any committed file — use obvious placeholders.

## Why

Real identifiers are not dangerous on their own, but they are leaky: they reveal internal structure, they persist in public git history and in pull-request timelines (which cannot be deleted), and scrubbing them after the fact requires a history rewrite plus a GitHub support request. Keeping them out at authoring time is the only cheap point to prevent this.
