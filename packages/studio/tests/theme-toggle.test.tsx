// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { ThemeProvider } from "better-themes"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ThemeToggle } from "@/ui/theme-toggle"

/**
 * End-to-end theme-flip test for the studio {@link ThemeToggle}.
 *
 * It mounts `better-themes`' `ThemeProvider` (imported here) around the real
 * {@link ThemeToggle} (which imports `useTheme` from the same `better-themes`
 * package). Because both resolve to the one installed copy, activating the
 * toggle drives the provider and flips the applied `.dark` class on the
 * document root and persists the choice to `localStorage`.
 *
 * This is the guard against the P1 singleton hazard: `better-themes`' `useTheme`
 * returns a silent no-op stub when it cannot find a provider in its own copy.
 * If the provider and the hook ever resolved to different installed copies,
 * `setTheme` would do nothing and this test's class/persistence assertions would
 * fail — so a passing run proves the one-copy wiring the app depends on.
 */

const STORAGE_KEY = "theme"

/** The theme toggle button, by its stable accessible name. */
function toggle(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: "Toggle theme",
  }) as HTMLButtonElement
}

function renderToggle(): void {
  render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeToggle />
    </ThemeProvider>
  )
}

describe("studio ThemeToggle over the better-themes provider", () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.className = ""
  })
  afterEach(() => cleanup())

  it("flips the applied theme and persists the choice", async () => {
    renderToggle()

    // Default is system; jsdom's matchMedia stub reports no dark preference, so
    // the root starts without the `.dark` class.
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBeFalsy()
    })

    // The cycle is light → dark → system; from the default `system` the first
    // activation lands on `light`.
    fireEvent.click(toggle())
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light")
    })
    expect(document.documentElement.classList.contains("dark")).toBeFalsy()

    // light → dark: the `.dark` class appears on the document root.
    fireEvent.click(toggle())
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBeTruthy()
    })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark")

    // dark → system: resolves to light (no dark preference), class removed.
    fireEvent.click(toggle())
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBeFalsy()
    })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("system")
  })

  it("persists the choice across a remount (reload)", async () => {
    renderToggle()
    fireEvent.click(toggle()) // system → light
    fireEvent.click(toggle()) // light → dark
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark")
    })

    cleanup()
    document.documentElement.className = ""

    // A fresh mount reads the persisted choice and re-applies `.dark`.
    renderToggle()
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBeTruthy()
    })
  })
})
