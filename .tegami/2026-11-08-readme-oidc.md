---
packages:
  "npm:@lakeql/adapter-fabric": patch
  "npm:@lakeql/adapter-trino": patch
  "npm:@lakeql/api": patch
  "npm:@lakeql/cli": patch
  "npm:@lakeql/column-parser": patch
  "npm:@lakeql/config": patch
  "npm:@lakeql/create-app": patch
  "npm:@lakeql/datasource": patch
  "npm:@lakeql/fabric-client": patch
  "npm:@lakeql/file-generator": patch
  "npm:@lakeql/helpers": patch
  "npm:@lakeql/logger": patch
  "npm:@lakeql/parquet": patch
  "npm:@lakeql/query-builder": patch
  "npm:@lakeql/response-transformer": patch
  "npm:@lakeql/scaffold": patch
  "npm:@lakeql/schema-generator": patch
  "npm:@lakeql/sql-read-strategy": patch
  "npm:@lakeql/storage": patch
  "npm:@lakeql/trino-client": patch
---

### Package metadata and publishing

Add READMEs for the packages that shipped without one, refine npm keywords (and drop the Trino-specific keyword from adapter-neutral packages), and re-publish every package through npm trusted publishing (OIDC) to validate the configuration. No runtime or API changes.
