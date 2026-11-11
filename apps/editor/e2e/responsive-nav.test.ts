// This is a Playwright suite, not a Vitest one: `test`/`expect` come from
// `@playwright/test` (imported below), so the Vitest-globals rule does not
// apply. The file is not part of any Vitest project (the root vitest `projects`
// exclude `apps/editor`); it runs only under Playwright's `test:e2e` script,
// and only in the `mobile-chromium` (phone-viewport) project (the desktop
// `chromium` project ignores it via `testIgnore`).
// oxlint-disable vitest/prefer-importing-vitest-globals

import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { expect, test } from "@playwright/test"

/**
 * End-to-end responsive-navigation tests for the Endpoint Builder at a phone
 * viewport (the `mobile-chromium` project uses Pixel 5, 393px wide — below both
 * the `768px` primary-rail breakpoint and the `560px` secondary-nav
 * breakpoint). They drive real clicks in Chromium against the served static
 * build and assert the two reported mobile regressions are fixed:
 *
 * 1. The primary icon rail is off-canvas on mobile and its only in-rail trigger
 *    is unreachable, so the header must carry an always-visible trigger that
 *    opens navigation and lets a rail view be reached.
 * 2. The fixed-width contextual secondary column clipped the main content on
 *    phones, so at ≤560px it must collapse out of the layout (full-width
 *    content) and be reachable on demand through a header trigger instead.
 *
 * Each test closes with an axe audit of the resulting state. `color-contrast`
 * stays disabled — the same explicitly manual-only conformance item as the
 * keyboard-a11y suite (Iteration-1 debt), not a regression this suite gates.
 */

/**
 * Asserts axe finds no violations on the current page state. `color-contrast`
 * is disabled to match the keyboard-a11y suite: contrast judgement is a
 * manual-only conformance item and the reused destructive-red validation text
 * sits just under AA — a pre-existing styling concern, not a mobile-navigation
 * regression this suite gates.
 */
async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze()
  expect(results.violations).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
})

test("header trigger opens the off-canvas rail and reaches a view on mobile", async ({
  page,
}) => {
  // The rail is off-canvas on mobile, so its view items are not reachable until
  // the header's always-visible trigger opens it.
  const openNav = page.getByRole("button", { name: "Open navigation" })
  await expect(openNav).toBeVisible()
  await expect(
    page.getByRole("button", { name: "JSON", exact: true })
  ).toBeHidden()

  // Activating the header trigger opens the rail sheet and surfaces the views.
  await openNav.click()
  const jsonItem = page.getByRole("button", { name: "JSON", exact: true })
  await expect(jsonItem).toBeVisible()

  // Selecting a view switches the main content — navigation is reachable.
  await jsonItem.click()
  await expect(page.getByRole("button", { name: "Copy JSON" })).toBeVisible()

  await expectNoAxeViolations(page)
})

test("secondary nav is a header-triggered sheet and the content is not clipped", async ({
  page,
}) => {
  // Navigate to Fields via the mobile primary-nav sheet; it has a contextual
  // secondary panel (the field-type palette).
  await page.getByRole("button", { name: "Open navigation" }).click()
  await page.getByRole("button", { name: "Fields", exact: true }).click()

  const canvas = page.getByLabel("Field canvas")
  await expect(canvas).toBeVisible()

  // The palette does not occupy an inline column at phone widths (that is what
  // clipped the content), so it is not present until its header trigger opens
  // it.
  await expect(page.getByLabel("Add String field")).toBeHidden()

  // The main content is not clipped horizontally: the canvas fits within the
  // viewport width (no horizontal overflow stealing space).
  const viewportWidth = page.viewportSize()?.width ?? 0
  expect(viewportWidth).toBeGreaterThan(0)
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).not.toBeNull()
  if (canvasBox !== null) {
    expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(viewportWidth + 1)
  }

  // The contextual-nav trigger opens the palette in a sheet, keeping it
  // reachable on demand.
  await page.getByRole("button", { name: "Open Field palette" }).click()
  await expect(page.getByLabel("Add String field")).toBeVisible()

  await expectNoAxeViolations(page)
})
