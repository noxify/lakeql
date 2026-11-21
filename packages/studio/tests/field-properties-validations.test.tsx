// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EndpointBuilder } from "@/components/studio/endpoint-builder"

import { defined } from "./helpers"

/**
 * Regression tests for the properties panel's add-validation picker. Switching
 * the selected field while the picker had been opened used to reuse the same
 * picker instance for the next field, which emitted a `null` value and added an
 * invalid `{ type: null }` refinement — once per switch.
 */

type User = ReturnType<typeof userEvent.setup>

/** Adds a top-level field of `type` by keyboard and names it `name`. */
async function addField(user: User, type: string, name: string): Promise<void> {
  screen.getByLabelText(`Add ${type} field`).focus()
  await user.keyboard("{Enter}")
  const input = defined(screen.getAllByLabelText("Field name").at(-1))
  await user.clear(input)
  await user.type(input, name)
  await user.tab()
}

/** The per-node "Select field" buttons, in canvas order. */
function selectButtons(): HTMLElement[] {
  return screen.getAllByRole("button", { name: "Select field" })
}

/** The "Select field" button of the first field (`field1`). */
function field1(): HTMLElement {
  return defined(selectButtons()[0])
}

/** The "Select field" button of the second field (`field2`). */
function field2(): HTMLElement {
  return defined(selectButtons()[1])
}

/** The properties panel region. */
function panel(): HTMLElement {
  return screen.getByRole("complementary", { name: "Field properties" })
}

/** Reads the exported fields from the JSON view, then returns to Fields. */
async function exportedFields(user: User): Promise<unknown> {
  // Anchored so the header's "Import an endpoint.json" button does not match.
  await user.click(screen.getByRole("button", { name: /^JSON$/u }))
  const text = defined(document.querySelector("pre")?.textContent ?? undefined)
  await user.click(screen.getByRole("button", { name: "Fields" }))
  return (JSON.parse(text) as { fields: unknown }).fields
}

describe("properties panel add-validation picker", () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => cleanup())

  it("switching fields after opening the picker adds no validation", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await user.click(screen.getByRole("button", { name: "Fields" }))
    await addField(user, "String", "field1")
    await addField(user, "Integer", "field2")

    // Open the picker on field1, then switch back and forth several times. The
    // clicks are inherently sequential (each reads the DOM the prior one
    // mutated), so they are written out rather than looped.
    await user.click(field1())
    await user.click(within(panel()).getByRole("combobox"))
    await user.click(field2())
    await user.click(field1())
    await user.click(field2())
    await user.click(field1())
    await user.click(field2())

    expect(
      screen.queryByRole("note", { name: "Field validation issues" })
    ).toBeNull()
    await expect(exportedFields(user)).resolves.toStrictEqual([
      { name: "field1", type: "String" },
      { name: "field2", type: "Integer" },
    ])
  })

  it("picking a kind still adds that validation to the selected field", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await user.click(screen.getByRole("button", { name: "Fields" }))
    await addField(user, "String", "field1")
    await addField(user, "Integer", "field2")

    await user.click(defined(selectButtons()[0]))
    await user.click(within(panel()).getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Email" }))

    await expect(exportedFields(user)).resolves.toStrictEqual([
      {
        name: "field1",
        type: "String",
        options: { validations: [{ type: "email" }] },
      },
      { name: "field2", type: "Integer" },
    ])
  })
})
