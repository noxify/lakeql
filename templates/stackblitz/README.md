# StackBlitz Reproduction Templates

These templates provide a minimal, runnable setup for reproducing bugs in LakeQL packages.

## Available Templates

| Template                                        | Package                        | Description                             |
| ----------------------------------------------- | ------------------------------ | --------------------------------------- |
| [generic](./generic/)                           | All standalone packages        | Multi-package reproduction              |
| [column-parser](./column-parser/)               | `@lakeql/column-parser`        | Trino column type parsing               |
| [helpers](./helpers/)                           | `@lakeql/helpers`              | Pagination, object utils, special chars |
| [logger](./logger/)                             | `@lakeql/logger`               | Structured logging with redaction       |
| [parquet](./parquet/)                           | `@lakeql/parquet`              | JSON Schema to Parquet conversion       |
| [query-builder](./query-builder/)               | `@lakeql/query-builder`        | SQL generation from structured queries  |
| [response-transformer](./response-transformer/) | `@lakeql/response-transformer` | Trino response to typed objects         |
| [schema-generator](./schema-generator/)         | `@lakeql/schema-generator`     | JSON/GraphQL/Hive schema generation     |

## Usage

1. Open a template in StackBlitz (opens a ready-to-edit fork):

   ```
   https://stackblitz.com/fork/github/noxify/lakeql/tree/main/templates/stackblitz/<package-name>
   ```

2. Modify `index.ts` to reproduce the bug

3. Run with `npm start`

4. Share the StackBlitz URL in your bug report

## Quick Links

| Package              | StackBlitz                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Generic              | [Open](https://stackblitz.com/fork/github/noxify/lakeql/tree/main/templates/stackblitz/generic)              |
| column-parser        | [Open](https://stackblitz.com/fork/github/noxify/lakeql/tree/main/templates/stackblitz/column-parser)        |
| helpers              | [Open](https://stackblitz.com/fork/github/noxify/lakeql/tree/main/templates/stackblitz/helpers)              |
| logger               | [Open](https://stackblitz.com/fork/github/noxify/lakeql/tree/main/templates/stackblitz/logger)               |
| parquet              | [Open](https://stackblitz.com/fork/github/noxify/lakeql/tree/main/templates/stackblitz/parquet)              |
| query-builder        | [Open](https://stackblitz.com/fork/github/noxify/lakeql/tree/main/templates/stackblitz/query-builder)        |
| response-transformer | [Open](https://stackblitz.com/fork/github/noxify/lakeql/tree/main/templates/stackblitz/response-transformer) |
| schema-generator     | [Open](https://stackblitz.com/fork/github/noxify/lakeql/tree/main/templates/stackblitz/schema-generator)     |

## Packages NOT included

The following packages require a live Trino cluster and cannot be reproduced in StackBlitz:

- `@lakeql/trino-client` — Needs a running Trino instance
- `@lakeql/adapters` — Needs Trino + S3
- `@lakeql/api` — Needs Trino for query execution
- `@lakeql/cli` — Needs Trino for introspection commands
- `@lakeql/create-app` — Downloads templates from GitHub

For these packages, please provide a code snippet and describe your expected vs. actual behavior in the bug report.
