import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for the Endpoint Builder keyboard-accessibility E2E
 * (Requirement 8). The suite drives real key events in a real browser against
 * a served static build of `apps/editor` (the same artifact deployed to
 * production), so it exercises the keyboard "grab / move / drop" mode,
 * palette-by-keyboard, selection, undo/redo, live-region announcements, and an
 * axe audit of the resulting states — none of which jsdom can assert
 * faithfully.
 *
 * The suite is deliberately separate from the Vitest unit run: it needs a
 * browser and a served build, so it is wired to its own `test:e2e` script and
 * is not part of `pnpm --filter @lakeql/studio test`.
 */
const PORT = 4321

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The keyboard-a11y suite assumes the desktop layout (always-visible icon
      // rail + inline secondary column); the responsive suite runs only in the
      // phone-viewport project below.
      testIgnore: /responsive-nav\.test\.ts/u,
    },
    {
      // A phone-viewport context (width ≤560px) for the responsive-navigation
      // suite: at this width the primary rail is an off-canvas sheet and the
      // contextual secondary nav collapses into a header-triggered sheet, so
      // the suite asserts both are reachable and the main content is not
      // clipped. Pixel 5 is 393px wide — below both the `768px` primary-rail
      // breakpoint and the `560px` secondary-nav breakpoint.
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
      testMatch: /responsive-nav\.test\.ts/u,
    },
  ],
  // Build then serve the static editor app; Playwright waits for the port.
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
