---
packages:
  "@lakeql/fabric-client":
    type: minor
  "@lakeql/adapter-fabric":
    type: patch
---

### Real TDS client for @lakeql/fabric-client

`@lakeql/fabric-client` now executes queries against Microsoft Fabric SQL endpoints instead of throwing from a stub. `FabricClient.query()` runs T-SQL over a pooled `mssql` connection using `azure-active-directory-access-token` authentication. `oauth2` credentials are resolved through `@azure/identity`'s client-secret flow, and a `bearer` token (for on-behalf-of scenarios) can be supplied per query. Transient Azure SQL failures are retried with exponential backoff, `AbortSignal` cancellation is honored, and server errors surface as `FabricQueryError` (with error number and state) while connection failures surface as `FabricClientError`.

The client is now query-focused: the previous metadata helper methods (`catalogs`, `schemas`, `tables`, `views`, `columns`) were removed, since metadata discovery is owned by the data source. `withRetry`, `RetryConfig`, `resolveCredential`, `TokenCredential`, and `FABRIC_TOKEN_SCOPE` are now exported.

### Fabric data source filters system schemas

`FabricDataSource.schemas()` in `@lakeql/adapter-fabric` now excludes Fabric's internal schemas (`sys`, `INFORMATION_SCHEMA`, `guest`, `queryinsights`, `_rsc`, and `db_*` role schemas) so schema discovery only surfaces user-facing schemas.
