import { defineConfig } from "tsdown"

export default defineConfig({
  define: {
    // Baked into the bundle so a pkg.pr.new preview build of this PR's
    // branch pulls its own template and `@lakeql/*` packages instead of
    // `main` + npm `latest`. CI sets both only for PR preview builds (see
    // `.github/workflows/ci.yml`); every other build leaves them unset, so
    // they default to "" and the published artifact behaves as before.
    // oxlint-disable-next-line no-restricted-properties
    __LAKEQL_PKG_SHA__: JSON.stringify(process.env.LAKEQL_PKG_SHA ?? ""),
    // oxlint-disable-next-line no-restricted-properties
    __TEMPLATE_REF__: JSON.stringify(process.env.LAKEQL_TEMPLATE_REF ?? ""),
  },
  deps: {
    neverBundle: true,
  },
  dts: true,
  entry: "src/*.ts",
  minify: true,
})
