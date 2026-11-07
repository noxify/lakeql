---
packages:
  "@lakeql/cli": patch
---

### Fix `pull --bulk` prompting for a catalog when entries already specify one

`lakeql-cli pull --bulk` no longer drops into the interactive "Choose a catalog"
prompt when the bulk config already specifies a `catalog` for every entry. The
catalog is now resolved only for data sources that have at least one entry
omitting `catalog`, so a fully specified (including generated multi-source)
config runs non-interactively over every entry.
