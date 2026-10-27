---
packages:
  "npm:@lakeql/api": minor
  "npm:@lakeql/config": minor
  "npm:@lakeql/file-generator": patch
---

### Connect the API to the runtime with two-level impersonation

`@lakeql/api` now accepts a `LakeQLRuntime` via `defineApiConfig({ runtime })` and exposes it to resolvers through `context.getReadStrategy(name)`, closing the read path. New exports:

- `createApiResolveAuth` builds a `ResolveAuth` that resolves impersonation per request. It uses a per-data-source `impersonationResolver` when present and otherwise falls back to the global one, carrying both `requestAuth` and adapter `options` through to the read strategy.
- `trinoUserImpersonation({ nameField })` produces an impersonation resolver that maps a JWT field (default `userName`) to Trino's `impersonateAs` (`X-Trino-User`).

`@lakeql/config` data-source definitions now accept an optional per-source `impersonationResolver`, passed through unchanged by `loadConfig` and `defineConfig`.

Generated query resolvers now resolve the read strategy via `context.getReadStrategy(...)` instead of a module-global `getRuntime()`.
