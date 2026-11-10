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
})
