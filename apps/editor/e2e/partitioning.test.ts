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
 * End-to-end coverage of the partitioning UX: enabling the mutation, the
 * two-option mode picker (starting on `off`), the write-timestamp auto-fill
 * helper adding a real `load_timestamp` field, and the by-field combobox
 * producing a badge. Drives the served static build in Chromium.
 *
 * Each test closes with an axe audit, with `color-contrast` disabled to match
 * the sibling E2E suites (a manual-only conformance item, not a regression this
 * suite gates).
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

test("enables the mutation and walks the partitioning modes", async ({
  page,
}) => {
  // The shell lands on General Settings, which hosts the mutation form.
  await expect(page.getByLabel("Table name")).toBeVisible()

  // Enable the mutation; the partitioning picker appears, starting on `off`.
  await page.getByRole("switch", { name: "Enable mutation" }).click()
  const offCard = page.getByRole("radio", { name: "Off (flat layout)" })
  await expect(offCard).toBeVisible()
  await expect(offCard).toHaveAttribute("aria-checked", "true")
  await expect(
    page.getByRole("radio", { name: "By field / custom format" })
  ).toBeVisible()
  // The implicit timestamp mode is gone: only the two modes are offered.
  await expect(
    page.getByRole("radio", { name: "By write timestamp" })
  ).toHaveCount(0)
  await expect(page.getByRole("radio")).toHaveCount(2)

  // The auto-fill helper adds a real, declared load_timestamp DateTime field.
  const addTimestamp = page.getByRole("button", {
    name: "Add write-timestamp field",
  })
  await addTimestamp.click()
  // A second click is blocked: the name is now taken.
  await expect(addTimestamp).toBeDisabled()

  // The Fields view shows it as an ordinary field row (no phantom managed row).
  await page.getByRole("button", { name: "Fields" }).click()
  await expect(page.getByRole("heading", { name: "Fields" })).toBeVisible()
  await expect(
    page.getByRole("group", { name: "load_timestamp" })
  ).toBeVisible()
  await expect(
    page.getByRole("group", { name: "load_timestamp (managed, read-only)" })
  ).toHaveCount(0)

  await expectNoAxeViolations(page)
})

test("builds a custom partition path from the by-field combobox", async ({
  page,
}) => {
  // Enable the mutation and switch to by-field mode.
  await page.getByRole("switch", { name: "Enable mutation" }).click()
  await page.getByRole("radio", { name: "By field / custom format" }).click()

  // With no partitionable fields yet, the combobox shows the empty hint.
  const input = page.getByLabel("Add partition field")
  await expect(input).toBeVisible()

  // Add a top-level field so the combobox has a candidate. The palette adds by
  // keyboard (focus the palette item, press Enter), matching the canvas flow.
  await page.getByRole("button", { name: "Fields" }).click()
  await expect(page.getByRole("heading", { name: "Fields" })).toBeVisible()
  await page.getByLabel("Add String field").focus()
  await page.keyboard.press("Enter")
  const nameInput = page.getByLabel("Field name").last()
  await nameInput.fill("region")
  await nameInput.blur()

  // Back to settings and the by-field picker; pick the field option.
  await page.getByRole("button", { name: "General Settings" }).click()
  await input.click()
  await page.getByRole("option", { name: "region" }).click()

  // A removable badge appears for the chosen segment.
  await expect(
    page.getByRole("button", { name: "Remove region" })
  ).toBeVisible()

  await expectNoAxeViolations(page)
})
