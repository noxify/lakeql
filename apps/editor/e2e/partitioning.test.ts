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
 * helper adding a real `load_timestamp` field, and the by-field popover
 * picker (plain field, date drill-down, search, Escape back-navigation). Drives the served static build in Chromium.
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
  await expect(page.getByRole("radio", { name: "By fields" })).toBeVisible()
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

/**
 * Adds a top-level field through the palette (keyboard, matching the canvas
 * flow) and names it, then returns to General Settings with partitioning on
 * "By fields".
 */
async function addNamedField(
  page: Page,
  type: "String" | "DateTime",
  name: string
): Promise<void> {
  await page.getByRole("button", { name: "Fields" }).click()
  await expect(page.getByRole("heading", { name: "Fields" })).toBeVisible()
  await page.getByLabel(`Add ${type} field`).focus()
  await page.keyboard.press("Enter")
  const nameInput = page.getByLabel("Field name").last()
  await nameInput.fill(name)
  await nameInput.blur()
}

/** Enables the mutation and switches to by-field partitioning. */
async function enableByField(page: Page): Promise<void> {
  await page.getByRole("switch", { name: "Enable mutation" }).click()
  await page.getByRole("radio", { name: "By fields" }).click()
}

test("picks a plain field from the partition popover", async ({ page }) => {
  await enableByField(page)

  // With no partitionable fields yet, the trigger is still present.
  const trigger = page.getByRole("button", { name: "Add partition field" })
  await expect(trigger).toBeVisible()

  await addNamedField(page, "String", "region")
  await page.getByRole("button", { name: "General Settings" }).click()

  await trigger.click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByRole("option", { name: "region" }).click()

  // The popover closes and a removable badge appears for the chosen segment.
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Remove region" })
  ).toBeVisible()

  await expectNoAxeViolations(page)
})

test("drills into a date field and adds year / month / day", async ({
  page,
}) => {
  await enableByField(page)
  await addNamedField(page, "DateTime", "event")
  await page.getByRole("button", { name: "General Settings" }).click()

  await page.getByRole("button", { name: "Add partition field" }).click()
  await page.getByRole("option", { name: "event" }).click()

  // The sub-page offers the combined option and the single components.
  await expect(
    page.getByRole("option", { name: "year / month / day" })
  ).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByRole("option", { name: "year / month / day" }).click()

  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Remove event → year" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Remove event → month" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Remove event → day" })
  ).toBeVisible()

  await expectNoAxeViolations(page)
})

test("finds a date component by searching and Escape returns to the root", async ({
  page,
}) => {
  await enableByField(page)
  await addNamedField(page, "DateTime", "event")
  await page.getByRole("button", { name: "General Settings" }).click()

  const trigger = page.getByRole("button", { name: "Add partition field" })
  await trigger.click()

  // Searching across fields and components finds `event → year`.
  await page
    .getByPlaceholder("Search fields and date components…")
    .fill("event year")
  const match = page.getByRole("option", {
    name: "event → year",
    exact: true,
  })
  await expect(match).toBeVisible()
  await expectNoAxeViolations(page)

  // Drill into the sub-page, then Escape returns to the root list.
  await page.getByPlaceholder("Search fields and date components…").fill("")
  await page.getByRole("option", { name: "event" }).click()
  await expect(
    page.getByRole("option", { name: "year / month / day" })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("option", { name: "event" })).toBeVisible()
  await expect(
    page.getByRole("option", { name: "year / month / day" })
  ).toHaveCount(0)
  await expectNoAxeViolations(page)

  // A second Escape closes the popover.
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
})
