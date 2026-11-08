/**
 * Shared Vitest setup: silence user-facing console output during tests.
 *
 * Many commands and runtime paths legitimately print progress or info
 * (`console.log` / `console.info` / `console.debug`) for real CLI/server use.
 * In the test runner that output is noise. This setup mutes those three
 * channels while deliberately leaving `console.warn` and `console.error`
 * intact, so genuine warnings and errors (e.g. unhandled rejections,
 * deprecations) still surface.
 *
 * The setup file is evaluated once per test file. Tests that need to assert on
 * console output can still re-spy locally (their spy overrides the mute).
 *
 * Wire it into a package via `test.setupFiles` in its `vitest.config.ts`.
 */
import { vi } from "vitest"

vi.spyOn(console, "log").mockReturnValue()
vi.spyOn(console, "info").mockReturnValue()
vi.spyOn(console, "debug").mockReturnValue()
