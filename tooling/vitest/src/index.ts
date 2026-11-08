import { fileURLToPath } from "node:url"

import { defineProject, mergeConfig } from "vitest/config"
import type { ViteUserConfig } from "vitest/config"

/**
 * Absolute path to the shared console-suppression setup file, resolved from
 * this package so it works no matter which package consumes the config.
 */
const suppressConsoleSetup = fileURLToPath(
  new URL("suppress-console.ts", import.meta.url)
)

/**
 * The shared Vitest project defaults for LakeQL packages: Node environment,
 * the standard test glob, type-test typecheck glob, and the console-mute
 * setup (silences `log`/`info`/`debug`, keeps `warn`/`error`).
 */
const baseProjectConfig: ViteUserConfig = {
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: [suppressConsoleSetup],
    typecheck: {
      include: ["tests/**/*.test-d.ts"],
    },
  },
}

/**
 * Defines a Vitest project for a LakeQL package using the shared defaults.
 *
 * Pass `overrides` to extend or replace parts of the base config; they are
 * deep-merged over {@link baseProjectConfig} (arrays are concatenated by
 * `mergeConfig`, so additional `setupFiles` are appended, not replaced).
 *
 * @param overrides - Package-specific Vitest config to merge over the defaults.
 * @returns A merged Vitest project config.
 *
 * @example
 * ```ts
 * // packages/foo/vitest.config.ts
 * import { defineLakeqlProject } from "@lakeql/vitest-config"
 *
 * export default defineLakeqlProject()
 * ```
 *
 * @example
 * ```ts
 * // with package-specific overrides (e.g. path aliases)
 * import path from "node:path"
 * import { defineLakeqlProject } from "@lakeql/vitest-config"
 *
 * export default defineLakeqlProject({
 *   resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
 * })
 * ```
 */
export function defineLakeqlProject(
  overrides: ViteUserConfig = {}
): ViteUserConfig {
  return defineProject(mergeConfig(baseProjectConfig, overrides))
}
