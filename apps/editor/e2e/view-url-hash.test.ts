// This is a Playwright suite, not a Vitest one: `test`/`expect` come from
// `@playwright/test` (imported below), so the Vitest-globals rule does not
// apply. The file is not part of any Vitest project (the root vitest `projects`
// exclude `apps/editor`); it runs only under Playwright's `test:e2e` script,
// and only in the desktop `chromium` project (the responsive project matches
// `responsive-nav.test.ts` exclusively).
// oxlint-disable vitest/prefer-importing-vitest-globals

import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { expect, test } from "@playwright/test"

/**
 * End-to-end tests for the URL-hash syncing of the active view. They drive real
 * clicks and a real page reload in Chromium against the served static build and
 * assert that navigating to a view writes `#<view>` to the URL, and that
 * reloading the page restores that same view — the deep-link / reload-restore
 * behavior that motivated the feature.
 *
 * Each test closes with an axe audit of the resulting state, with
 * `color-contrast` disabled to match the keyboard-a11y and responsive-nav
 * suites (a manual-only conformance item, not a regression this suite gates).
 */

/**
 * Asserts axe finds no violations on the current page state. `color-contrast`
 * is disabled to match the sibling E2E suites: contrast judgement is a
 * manual-only conformance item, not a regression this suite gates.
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

test("navigating to a view writes the hash and a reload restores it", async ({
  page,
}) => {
  // The shell lands on General Settings with no hash.
  await expect(page.getByLabel("Table name")).toBeVisible()

  // Navigating to JSON writes `#json` to the URL.
  await page.getByRole("button", { name: "JSON", exact: true }).click()
  await expect(page.getByRole("button", { name: "Copy JSON" })).toBeVisible()
  await expect(page).toHaveURL(/#json$/u)

  // Reloading restores the JSON view from the hash (not the default Settings).
  await page.reload()
  await expect(page.getByRole("button", { name: "Copy JSON" })).toBeVisible()
  await expect(page.getByLabel("Table name")).toBeHidden()

  await expectNoAxeViolations(page)
})

test("a deep link to a view hash opens that view directly", async ({
  page,
}) => {
  // Opening the app at a view hash lands on that view without any navigation.
  await page.goto("/#fields")
  await expect(page.getByRole("heading", { name: "Fields" })).toBeVisible()
  await expect(page.getByLabel("Field canvas")).toBeVisible()

  await expectNoAxeViolations(page)
})
