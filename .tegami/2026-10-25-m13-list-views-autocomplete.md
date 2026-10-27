---
packages:
  "@lakeql/cli":
    type: patch
---

### `list-views` schema prompt gains autocomplete

`list-tables` and `list-views` share one implementation now, which resolves a drift between them: the `list-views` schema-selection prompt previously had no autocomplete while `list-tables` did. Both prompts now support autocomplete. Command names, descriptions, options, and output columns are unchanged.
