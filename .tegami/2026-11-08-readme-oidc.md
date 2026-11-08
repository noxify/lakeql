---
packages:
  "npm:@lakeql/adapter-fabric": patch
  "npm:@lakeql/adapter-trino": patch
  "npm:@lakeql/config": patch
  "npm:@lakeql/datasource": patch
  "npm:@lakeql/fabric-client": patch
  "npm:@lakeql/scaffold": patch
  "npm:@lakeql/sql-read-strategy": patch
  "npm:@lakeql/storage": patch
---

### Add package READMEs and validate npm trusted publishing

Publish READMEs for the packages introduced in 1.0.0 and re-publish them through the configured npm trusted-publishing (OIDC) flow to validate it. No runtime or API changes.
