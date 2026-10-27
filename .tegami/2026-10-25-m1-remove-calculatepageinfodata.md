---
packages:
  "@lakeql/api":
    type: major
---

### Remove `calculatePageInfoData`

Deleted the unused `calculatePageInfoData` helper and its public export from `@lakeql/api`. It was a dead copy of `calculatePageInfo` in `@lakeql/helpers`, which remains the live implementation. Anyone needing the same calculation should import `calculatePageInfo` from `@lakeql/helpers/calculate-page-info`.
