import { defineConfig } from "tsdown"

export default defineConfig({
  // React and react-dom are peer dependencies: never bundle a copy of them
  // into the library output, so the consumer's single React instance is used.
  deps: {
    neverBundle: true,
  },
  dts: true,
  entry: "src/index.ts",
  minify: true,
  // Several shadcn components carry a top-level `"use client"` directive.
  // Bundling the single library entry collapses those modules together, so
  // rolldown warns that the per-module directive may not survive
  // (MODULE_LEVEL_DIRECTIVE). That is harmless here: `@lakeql/studio` is a
  // client-only library (consumed by the Vite SPA `apps/editor` and the
  // standalone browser artifact), never across a React Server Components
  // boundary, so the directive is inert. Suppress just this one warning.
  suppressWarnings: [/MODULE_LEVEL_DIRECTIVE/u],
})
