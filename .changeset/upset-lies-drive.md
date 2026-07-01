---
"@lakeql/cli": patch
---

improve error handling for bulk pull: collect and display individual item failures

When running `pnpm cli pull --bulk` with more than 10 items per entry, individual item failures were not properly collected and displayed. The user would see only a generic error message without knowing which specific tables or views failed.

This issue only occurred in compact mode (>10 items per bulk entry), as the parallel worker pattern wasn't aggregating individual failures. Normal pulls and smaller bulk operations were not affected.

This improvement now:

- Collects all failed items during parallel execution
- Displays a detailed error report showing:
  - The count of failed items
  - The full path of each failed item (catalog.schema.item_name)
  - The specific error message for each failure

This makes it much easier to identify and troubleshoot which tables or views encountered issues during bulk imports.
