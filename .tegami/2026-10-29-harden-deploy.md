---
packages:
  "@lakeql/fabric-client":
    type: patch
  "@lakeql/scaffold":
    type: patch
---

### Harden the generated app's deployment artifact

Bumped `@azure/identity` to `4.14.1`, which pulls the fixed `@azure/msal-node` (`>=7.1.0`) and resolves the flagged msal-node CVE at the root with no API change.

- `@lakeql/fabric-client` now depends on `@azure/identity@4.14.1`.
- Generated apps created by `@lakeql/scaffold` pin `@azure/identity@4.14.1`, and the generated Dockerfile now prunes dev dependencies (`pnpm prune --prod`) and removes the base image's bundled npm/npx — producing a smaller, hardened production image.
