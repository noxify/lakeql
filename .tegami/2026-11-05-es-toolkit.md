---
packages:
  "@lakeql/helpers":
    type: major
  "@lakeql/cli":
    type: major
  "@lakeql/schema-generator":
    type: major
---

### Replace lodash-es with es-toolkit; centralize casing in @lakeql/helpers

String casing now runs through `es-toolkit` instead of `lodash-es`. The casing
helpers live in a single new `@lakeql/helpers/string-case` module —
`toCamelCase`, `toUpperFirst`, and `toCapitalize` — which deburr Latin
diacritics and ligatures (via `es-toolkit/compat`) before applying the strict
`es-toolkit` casing functions. The CLI name derivation, the `namePrefix`
validator, and the schema generator all share these wrappers, so casing can no
longer drift between name generation and validation.

Generated names and validator behavior are unchanged for every input class
except one: symbol and currency characters (for example `€`, `¥`, `£`, `§`).
`lodash` kept those characters when camel-casing (so `"x_€"` became `"x€"`),
which could never be a valid GraphQL name. The strict `es-toolkit` casing drops
them, so such inputs now resolve to the valid folded form (`"x_€"` → `"x"`).

This only affects schema, table, or `namePrefix` values that contain such
symbols: their generated GraphQL names change (the symbol is dropped), and a
`namePrefix` that previously failed validation solely because of a kept symbol
is now accepted as its folded form. Names built from letters, digits,
separators, Latin diacritics/ligatures, or non-Latin scripts (Hangul, Cyrillic,
Greek, emoji) are byte-for-byte identical to the previous `lodash` output.
