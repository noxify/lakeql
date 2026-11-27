// This is a Playwright suite, not a Vitest one: `test`/`expect` come from
// `@playwright/test` (imported below), so the Vitest-globals rule does not
// apply. The file is not part of any Vitest project (the root vitest `projects`
// exclude `apps/editor`); it runs only under Playwright's `test:e2e` script,
// and only in the `mobile-chromium` (phone-viewport) project (the desktop
// `chromium` project ignores it via `testIgnore`).
// oxlint-disable vitest/prefer-importing-vitest-globals

import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

/**
 * End-to-end test for the desktop-only gate at a phone viewport (the
 * `mobile-chromium` project uses Pixel 5, 393px wide — below the `768px`
 * desktop breakpoint). The editor is desktop-only for now, so a phone sees a
 * notice instead of the editor shell. The responsive mobile layout itself stays
 * covered by the jsdom suite (`studio-shell-mobile.test.tsx`, which opts out of
 * the gate with `desktopOnly={false}`).
 */

test("a phone viewport shows the desktop-only notice instead of the editor", async ({
  page,
}) => {
  await page.goto("/")

  await expect(
    page.getByRole("heading", { name: "Desktop only" })
  ).toBeVisible()

  // None of the editor chrome is reachable: not the mobile navigation trigger,
  // not the rail views, not the header actions.
  await expect(
    page.getByRole("button", { name: "Open navigation" })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "JSON", exact: true })
  ).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Import" })).toHaveCount(0)

  // The notice fits the viewport (no horizontal overflow).
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(0)

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze()
  expect(results.violations).toEqual([])
})
