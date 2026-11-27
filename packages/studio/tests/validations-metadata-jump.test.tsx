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
  version: "2.0",
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
  version: "2.0",
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

/**
 * A definition partitioned by a field that does not exist. The segment is
 * well-formed, so the schema accepts it; only the unresolved-segment finding
 * flags it, and that finding targets the partition picker in Settings.
 */
const unknownPartitionFieldDefinition = JSON.stringify({
  version: "2.0",
  tableName: "events",
  catalog: "main",
  schema: "public",
  fields: [{ name: "region", type: "String" }],
  mutation: {
    loadStrategy: "append",
    basePath: "/d",
    partitioning: "ghost",
  },
})

describe("Validations summary — partitioning jump", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it("jumps from the Partitioning issue to the picker and shows the error there", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await user.upload(fileInput(), jsonFile(unknownPartitionFieldDefinition))

    await gotoView(user, "Validations")
    const issueList = screen.getByRole("complementary", {
      name: "Validation issues",
    })
    // The entry is a real, clickable button, not a static line.
    await user.click(
      within(issueList).getByRole("button", { name: /Partitioning/u })
    )

    // The jump switches to Settings and focuses the partition picker input.
    await waitFor(() => {
      const input = metadataInput("partitioning")
      expect(input).not.toBeNull()
      expect(document.activeElement).toBe(input)
    })

    // The control carries the error state and the same message as the list.
    const input = screen.getByLabelText("Add partition field")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(
      screen.getByText(/Partition field "ghost" does not exist/u)
    ).toBeDefined()
  })

  it("shows no error state on the picker for a valid partitioning", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await user.upload(
      fileInput(),
      jsonFile(unknownPartitionFieldDefinition.replace('"ghost"', '"region"'))
    )

    await gotoView(user, "General Settings")
    const input = screen.getByLabelText("Add partition field")
    expect(input.getAttribute("aria-invalid")).toBe("false")
    expect(screen.queryByText(/does not exist/u)).toBeNull()
  })
})

describe("partition picker — empty by-field selection", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it("shows the error state and a single readable message when no field is chosen", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)
    await user.upload(fileInput(), jsonFile(validDefinition))

    await gotoView(user, "General Settings")
    await user.click(screen.getByRole("switch", { name: "Enable mutation" }))
    // The radio card's accessible name also includes its description, so
    // select it by its visible title.
    await user.click(screen.getByText("By fields"))

    const input = screen.getByLabelText("Add partition field")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(
      screen.getAllByText(/Choose at least one partition field/u)
    ).toHaveLength(1)
    expect(screen.queryByText(/expected string to have/u)).toBeNull()
  })
})
