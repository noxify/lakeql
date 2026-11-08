# Vale prose linting

Vale lints the MDX prose under `apps/docs/content` against a plain-language
style, as a mechanical companion to the `.kiro/steering/docs-content.md`
"Prose Style" rules. It catches the mechanical layer (filler words, marketing
adjectives, exclamation points, rot-words, long sentences, word choice); the
semantic rules (ownership boundaries, link-don't-restate, domain facts) stay
with the steering file and human/agent review.

## Running it

```bash
# From the workspace root:
pnpm --filter docs lint:prose:sync   # one-time / after config changes: pulls the Google package
pnpm --filter docs lint:prose        # lint content at the default level (warning+)
```

Ad-hoc, from `apps/docs`:

```bash
pnpm exec vale content                              # warning + error (the default)
pnpm exec vale --minAlertLevel suggestion content   # include suggestions (passive voice, long sentences, …)
pnpm exec vale content/cli                          # a single area
```

## How it is configured

- `.vale.ini` — the config. Bases MDX files on the **Google** package plus our
  **LakeQL** style. `MinAlertLevel = warning` keeps routine suggestions out of
  the default run; raise it with `--minAlertLevel suggestion` for a deep review.
- `Vocab = LakeQL` — accepted product terms and API symbols
  (`.vale/styles/config/vocabularies/LakeQL/accept.txt`).
- `.vale/styles/LakeQL/` — our custom rules:
  - `MarketingAdjectives` — "powerful", "seamless", "robust", …
  - `Filler` — "simply", "just", "basically", "in order to", …
  - `RotWords` — "currently", "soon", "at the moment", …
  - `Exclamation` — no exclamation points in body text
  - `Anthropomorphism` — "the server wants", "the query thinks", …
  - `SentenceLength` — flags sentences over 30 words (one idea per sentence)

## Deliberately disabled Google rules

These fight intentional LakeQL conventions (see `.vale.ini` comments):

- `Google.Headings` — we use **Title Case** headings by project convention, and
  heading text derives the anchor IDs cross-page links depend on.
- `Google.Contractions` — we keep the even, formal reference tone.
- `Google.EmDash` — it flags every em-dash; we keep legitimate ones in tables
  and "term — definition" rows. Insertion-clause dashes are governed
  semantically by the steering Prose Style rule, which a regex cannot judge.
- `Google.Parens` — "(s)" plurals appear deliberately in a few option tables.
- `Vale.Spelling` / `Vale.Terms` (via `BasedOnStyles`) — the generic spell and
  term-casing checks produce mostly false positives on code tokens, acronyms,
  and API symbols.

## Calibration status

This is a working baseline, not a fully tuned ruleset. The remaining warnings
(mostly `Google.WordList` word-choice suggestions and a few `Google.Latin`
"e.g."→"for example" fixes) are genuine small improvements to work through over
time, not setup bugs. Tune further by adding terms to the vocab, adjusting rule
levels in `.vale.ini`, or extending the `LakeQL` style.

## MDX scope notes

`.vale.ini` uses `BlockIgnores`/`TokenIgnores` to skip component props and
self-contained components (`<Command>`, `<CliCommandDetails>`, `<ApiReference>`,
`<FileTree>`, `<PageList>`, `<Terminal>`) so their attribute strings are not
linted as prose. Fenced code blocks are skipped by the Markdown parser. If a new
component starts producing false positives on its props, add it to the ignore
lists.
