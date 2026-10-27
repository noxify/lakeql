---
packages:
  "@lakeql/query-builder":
    type: patch
---

### Emit the record-present sentinel column

The generated `records` CTE now selects `TRUE AS "__lakeql_record_present"`. The response normalizer relies on this sentinel to tell real data rows (`true`) from the synthetic count-only row (`null`) produced by the FULL JOIN when no records match. Without it, every read query failed at runtime with `Malformed adapter response: "__lakeql_record_present" must be true for data rows or null for synthetic rows, got undefined`.
