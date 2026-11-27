// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { EndpointBuilder } from "@/components/studio/endpoint-builder"

/**
 * Component tests for the error state of the General Settings inputs. The
 * state follows the validity gate, so an empty required input is flagged as
 * soon as the gate blocks export for it — not only after a bad value is typed.
 */

/** The aria-invalid attribute of the input labelled `label`. */
function invalidOf(label: string): string | null {
  return screen.getByLabelText(label).getAttribute("aria-invalid")
}

describe("General Settings error state", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it("flags the empty required inputs on a fresh editor, with a message", () => {
    render(<EndpointBuilder />)

    expect(
      ["Table name", "Catalog", "Schema"].map((label) => invalidOf(label))
    ).toStrictEqual(["true", "true", "true"])
    expect(
      ["Table name", "Catalog", "Schema"].map(
        (label) => screen.queryByText(`${label} is required.`) !== null
      )
    ).toStrictEqual([true, true, true])
  })

  it("clears the error of the input that was filled in, and only that one", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    await user.type(screen.getByLabelText("Catalog"), "main")

    expect(invalidOf("Catalog")).toBe("false")
    expect(screen.queryByText("Catalog is required.")).toBeNull()
    expect(invalidOf("Table name")).toBe("true")
    expect(invalidOf("Schema")).toBe("true")
  })

  it("shows the pattern rule for an invalid value instead of 'required'", async () => {
    const user = userEvent.setup()
    render(<EndpointBuilder />)

    await user.type(screen.getByLabelText("Schema"), "bad name")

    expect(invalidOf("Schema")).toBe("true")
    expect(screen.queryByText("Schema is required.")).toBeNull()
    expect(
      screen.getAllByText(/Letters, digits and underscores only/u).length
    ).toBeGreaterThan(0)
  })

  it("leaves the optional data source without an error state", () => {
    render(<EndpointBuilder />)

    expect(invalidOf("Data source")).not.toBe("true")
  })
})
