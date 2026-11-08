## @lakeql/column-parser@1.0.0

### LakeQL 1.0 — first stable release on the adapter-based architecture

The 1.0 line is a ground-up restructure of the 0.x packages around a single adapter-based architecture: a neutral data-source/adapter contract, config + runtime composition, the Trino (read + write) and Fabric (read-only) adapters, the CLI (endpoint generation and `create-app`), and the GraphQL API layer.

This is a breaking release with no in-place upgrade path from the 0.x line — re-scaffold projects with `create-app` and re-author configuration against the 1.0 APIs rather than upgrading existing code.

## @lakeql/column-parser@0.1.6

### Migrate release tooling from Changesets to Tegami

Replaced Changesets with Tegami for versioning and publishing.

### Update dependencies

Updated all dependencies to their latest versions.

# @lakeql/column-parser

## 0.1.5

### Patch Changes

- bfcca1a: update dependencies

## 0.1.4

### Patch Changes

- b48beff: Bump tsdown devDependency from 0.22.2 to 0.22.3

## 0.1.3

### Patch Changes

- 5c3c967: update dependencies

## 0.1.2

### Patch Changes

- 450ba80: Add package description and keywords to package.json for npm discoverability

## 0.1.1

### Patch Changes

- 974e04d: Add package README files

## 0.1.0

### Minor Changes

- 12dd6ae: initial release
