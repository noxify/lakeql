import { defineConfig } from "tsdown"

export default defineConfig({
  copy: [{ from: "../../LICENSE", to: "dist" }],
  deps: {
    skipNodeModulesBundle: true,
  },
  dts: true,
  entry: "src/index.ts",
  minify: true,
})
