// This is a Playwright suite, not a Vitest one: `test`/`expect` come from
// `@playwright/test`, so the Vitest-globals rule does not apply. It runs only
// under Playwright's `test:e2e` script in the desktop `chromium` project.
// oxlint-disable vitest/prefer-importing-vitest-globals
import { readFile } from "node:fs/promises"

import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { expect, test } from "@playwright/test"

/**
 * End-to-end coverage of the write method: switching a configured storage
 * mutation to insert asks for confirmation, applies it, and exports a
 * definition with `writeMethod: "insert"` and no `basePath`.
 */
async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze()
  expect(results.violations).toEqual([])
}

test("switches to insert, confirms, and exports without basePath", async ({
  page,
}) => {
  await page.goto("/")

  // Minimal valid metadata and one field so the export gate opens.
  await page.getByLabel("Table name").fill("events")
  await page.getByLabel("Catalog").fill("analytics")
  await page.getByLabel("Schema", { exact: true }).fill("tracking")
  await page.getByRole("button", { name: "Fields" }).click()
  await page.getByLabel("Add String field").focus()
  await page.keyboard.press("Enter")
  const nameInput = page.getByLabel("Field name").last()
  await nameInput.fill("id")
  await nameInput.blur()
  await page.getByRole("button", { name: "General Settings" }).click()

  // Enable the mutation with a base path (the storage default).
  await page.getByRole("switch", { name: "Enable mutation" }).click()
  const writeMethod = page.getByRole("radiogroup", { name: "Write method" })
  await expect(
    writeMethod.getByRole("radio", { name: /Storage/u })
  ).toHaveAttribute("aria-checked", "true")
  await page.getByLabel("Base path").fill("warehouse/events")
  await page.getByLabel("Base path").blur()

  // Switching discards the base path, so a confirmation dialog opens.
  await writeMethod.getByRole("radio", { name: /Insert/u }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("warehouse/events")
  await expectNoAxeViolations(page)
  await dialog.getByRole("button", { name: "Switch to insert" }).click()
  await expect(dialog).toHaveCount(0)

  // Insert hides the storage-only controls.
  await expect(page.getByLabel("Base path")).toHaveCount(0)
  await expect(
    page.getByRole("radiogroup", { name: "Partitioning mode" })
  ).toHaveCount(0)

  // The exported JSON carries writeMethod "insert" and no basePath.
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export" }).click()
  const download = await downloadPromise
  const path = await download.path()
  const exported = JSON.parse(await readFile(path, "utf-8"))

  expect(exported.mutation).toEqual({
    loadStrategy: "append",
    writeMethod: "insert",
  })
  await expectNoAxeViolations(page)
})
