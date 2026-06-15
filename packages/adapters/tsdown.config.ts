import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    skipNodeModulesBundle: true,
  },
  dts: true,
  entry: "src/*.ts",
  minify: true,
})
