## @lakeql/datasource@1.0.1

### Package metadata and publishing

Add READMEs for the packages that shipped without one, refine npm keywords (and drop the Trino-specific keyword from adapter-neutral packages), and re-publish every package through npm trusted publishing (OIDC) to validate the configuration. No runtime or API changes.

## @lakeql/datasource@1.0.0

### LakeQL 1.0 — first stable release on the adapter-based architecture

The 1.0 line is a ground-up restructure of the 0.x packages around a single adapter-based architecture: a neutral data-source/adapter contract, config + runtime composition, the Trino (read + write) and Fabric (read-only) adapters, the CLI (endpoint generation and `create-app`), and the GraphQL API layer.

This is a breaking release with no in-place upgrade path from the 0.x line — re-scaffold projects with `create-app` and re-author configuration against the 1.0 APIs rather than upgrading existing code.
