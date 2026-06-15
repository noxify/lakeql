# @lakeql/trino-client

## 0.3.0

### Minor Changes

- c30f3d9: Add mutation pipeline support across the LakeQL stack.
  - **schema-generator**: Extend endpoint definition schema with optional `mutation` config (load strategy + base path) and per-field `options` (required, validations)
  - **cli**: Generate working mutation resolvers that invoke the write pipeline, generate Zod validation schemas from field options, display mutation config in `create-endpoint` summary, set `mutation: false` for pulled endpoints
  - **api/trino-client/create-app**: Dependency updates to support the new write pipeline integration

## 0.2.0

### Minor Changes

- 9c7ff16: Rewrite `@lakeql/trino-client` from `got` to native `fetch`.

  **Breaking changes:**
  - Removed `gotOpts` property from `QueryProps` — use `signal` for abort control instead
  - Removed `got`, `@hapi/bourne`, and `@t3-oss/env-core` as dependencies (zero runtime deps now)

  **New features:**
  - `stream()` — async generator that yields rows one at a time as pages are fetched
  - `cancelQuery(queryId)` — cancels a running query via DELETE
  - `cancelAllQueries()` — cancels all in-flight queries tracked by this client
  - `getActiveQueries()` — returns IDs of all currently active queries
  - `transform` prop on `QueryProps` — map raw row arrays to typed objects
  - `signal` (AbortSignal) support for query cancellation
  - Configurable retry with exponential backoff (`RetryConfig`)
  - `TrinoCancellationError`, `TrinoTimeoutError` error classes

### Patch Changes

- 450ba80: Add package description and keywords to package.json for npm discoverability
- 2432512: Extract inline parameter types into named exported interfaces with JSDoc for improved API reference documentation

## 0.1.1

### Patch Changes

- 974e04d: Add package README files

## 0.1.0

### Minor Changes

- 12dd6ae: initial release
