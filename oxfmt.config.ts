import { defineConfig } from "oxfmt"
import ultracite from "ultracite/oxfmt"

export default defineConfig({
  ...ultracite,
  lineWidth: 100,
  semi: false,
  sortImports: true,
  sortTailwindcss: true,
  trailingComma: "es5",
  ignorePatterns: [
    "apps/docs/src/components/beautiful-mermaid/**",
    ".tegami/publish-lock.yaml",
    // Vendored minitrino library — keep it byte-for-byte identical to the
    // upstream release so version upgrades stay a clean, diffable swap.
    ".minitrino/**",
  ],
})
