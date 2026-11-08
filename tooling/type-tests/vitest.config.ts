import { defineProject } from "vitest/config"

/**
 * This package has no runtime tests — only compile-time cross-package type
 * assertions in `*.test-d.ts`, run via Vitest's `--typecheck` mode. It does
 * not use the shared `@lakeql/vitest-config` base, which assumes runtime tests
 * under `tests/`; here the only sources are root-level typecheck files.
 */
export default defineProject({
  test: {
    // No runtime test files in this package.
    include: [],
    typecheck: {
      enabled: true,
      include: ["*.test-d.ts"],
    },
  },
})
