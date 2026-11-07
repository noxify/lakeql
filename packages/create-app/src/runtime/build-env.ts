/**
 * The build-time values tsdown's `define` map injects into the bundled
 * output, resolved to empty strings when unset or when running outside the
 * bundler (e.g. `tsx` dev runs).
 */
export interface BuildEnv {
  /**
   * Commit SHA used to build `https://pkg.pr.new` preview install URLs for
   * `@lakeql/*` dependencies. Empty on the released build.
   */
  previewSha: string
  /**
   * Git ref appended to the giget template reference as `#<ref>`. Empty
   * resolves to the repository's default branch, matching today's behavior.
   */
  templateRef: string
}

/**
 * Reads `__TEMPLATE_REF__` and `__LAKEQL_PKG_SHA__`, the two constants
 * tsdown's `define` map replaces at build time, behind a
 * `typeof … === "string"` guard.
 *
 * `typeof` on an undeclared identifier is safe at runtime, so dev runs
 * (`tsx`, no bundler define) resolve both values to `""` instead of
 * throwing a `ReferenceError`. This keeps the function pure and callable
 * directly from tests without a bundler.
 */
export function getBuildEnv(): BuildEnv {
  return {
    previewSha:
      typeof __LAKEQL_PKG_SHA__ === "string" ? __LAKEQL_PKG_SHA__ : "",
    templateRef: typeof __TEMPLATE_REF__ === "string" ? __TEMPLATE_REF__ : "",
  }
}
