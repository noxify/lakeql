---
"@lakeql/trino-client": minor
---

Rewrite `@lakeql/trino-client` from `got` to native `fetch`.

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
