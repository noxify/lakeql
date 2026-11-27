# Endpoint Builder keyboard-accessibility E2E

Playwright + `@axe-core/playwright` end-to-end tests for the Endpoint Builder Canvas (spec Requirement 8). They drive real key events in Chromium against a served static build of this app and assert the full keyboard structural set with no drag-only exception.

Run them with a browser-capable environment:

```bash
pnpm --filter editor exec playwright install chromium   # one-time
pnpm --filter editor test:e2e
```

The suite builds the app and serves it via `vite preview` (see `playwright.config.ts`), so it needs no running dev server. It is intentionally separate from the Vitest unit run (`apps/editor` is not a Vitest project) because it needs a real browser and a served build.

## Automated coverage (what these tests prove)

- **SC 2.1.1 Keyboard** for adding a field from the palette. Reordering fields is pointer-only by design, so there is no keyboard move mode to cover.
- **SC 2.4.3 Focus Order / 2.4.7 Focus Visible**: focus lands in the name input of an added field, or of a field jumped to from the Validations view.
- Selection semantics, keyboard undo/redo, the live-region announcement for keyboard adds, rail and command-palette operation.
- The **desktop-only gate**: at a phone viewport (Pixel 5) a "Desktop only" notice replaces the editor (`desktop-only.test.ts`, `mobile-chromium` project).
- An **axe** audit (WCAG 2.0/2.1 A + AA rules) on the resulting states.

The `color-contrast` rule is excluded from the axe audit — contrast judgement is a manual-only item (below), and the Iteration-1 destructive-red validation text sits a hair under the 4.5:1 threshold, a pre-existing styling concern rather than a keyboard-operability regression.

## Remaining manual pass (not asserted here)

Per Requirement 8.3, these stay a human pass and are **not** claimed from the automated suite:

- Real screen-reader narration quality (SC 4.1.2 / 1.3.1).
- Colour-contrast judgement (SC 1.4.3) — including the destructive-red validation text noted above.
- 200% zoom / reflow (SC 1.4.10).
