// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EndpointBuilder } from "@/components/studio/endpoint-builder"
import { metadataInputId } from "@/components/studio/metadata-nav"

/**
 * Component tests for the metadata jump-to-field in the Validations summary: a
 * navigable metadata issue renders as a clickable button whose activation
 * switches to the Settings view and moves keyboard focus to the matching form
 * input. Driven through the real {@link EndpointBuilder} in jsdom the way a user
 * would, mirroring the field jump-to-field coverage in `studio-shell.test.tsx`.
 */

/** Navigates the shell to a rail view by activating its rail item. */
async function gotoView(
  user: ReturnType<typeof userEvent.setup>,
  name: "General Settings" | "Fields" | "Validations" | "JSON"
): Promise<void> {
  await user.click(screen.getByRole("button", { name }))
}

/** The header's hidden file input the Import button drives. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (input === null) {
    throw new Error("file input not found")
  }
  return input
}

/** Builds a `File` carrying `contents` as the user's import selection. */
function jsonFile(contents: string, name = "endpoint.json"): File {
  return new File([contents], name, { type: "application/json" })
}

/** The element carrying a navigable metadata input's stable id, or `null`. */
function metadataInput(
  key: Parameters<typeof metadataInputId>[0]
): Element | null {
  return document.querySelector(`#${CSS.escape(metadataInputId(key))}`)
}

/**
 * A definition with an invalid `tableName` (contains a space, so it fails
 * `metadataFieldPattern`). It parses structurally — so the import loads it —
 * but the validity gate flags a navigable `tableName` metadata issue.
 */
const badTableNameDefinition = JSON.stringify({
  version: "1.0",
  tableName: "bad name",
  catalog: "main",
  schema: "public",
  fields: [{ name: "id", type: "String" }],
  mutation: false,
})

/**
 * A fully valid definition. Enabling mutation through the Settings UI defaults
 * `basePath` to the empty string, which fails `z.string().min(1)` and surfaces
 * a navigable `basePath` metadata issue — the only way a `basePath` issue can
 * exist, since the base path input only renders while mutation is enabled.
 */
const validDefinition = JSON.stringify({
  version: "1.0",
  tableName: "events",
  catalog: "main",
  schema: "public",
  fields: [{ name: "id", type: "String" }],
  mutation: false,
})

describe("Validations summary — metadata jump-to-field", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it("renders a navigable tableName issue that jumps to Settings and focuses its input", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await user.upload(fileInput(), jsonFile(badTableNameDefinition))

    await gotoView(user, "Validations")
    const issueList = screen.getByRole("complementary", {
      name: "Validation issues",
    })
    // The metadata entry is a real, clickable button (not a static entry).
    const entry = within(issueList).getByRole("button", { name: /Table name/u })
    await user.click(entry)

    // The jump switches to Settings and moves focus to the matching input.
    await waitFor(() => {
      const input = metadataInput("tableName")
      expect(input).not.toBeNull()
      expect(document.activeElement).toBe(input)
    })
  })

  it("renders a navigable basePath issue that jumps to Settings and focuses its input", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await user.upload(fileInput(), jsonFile(validDefinition))

    // Enable mutation in Settings so the base path input exists; it defaults to
    // the empty string, which is the (only) state in which a basePath issue
    // arises.
    await gotoView(user, "General Settings")
    await user.click(screen.getByRole("switch", { name: "Enable mutation" }))
    // Sanity: the base path input is present and carries the stable nav id.
    expect(metadataInput("basePath")).not.toBeNull()

    await gotoView(user, "Validations")
    const issueList = screen.getByRole("complementary", {
      name: "Validation issues",
    })
    const entry = within(issueList).getByRole("button", { name: /Base path/u })
    await user.click(entry)

    await waitFor(() => {
      const input = metadataInput("basePath")
      expect(input).not.toBeNull()
      expect(document.activeElement).toBe(input)
    })
  })
})
