import { defineConfig } from "tsdown"

export default defineConfig({
  copy: [{ from: "../../LICENSE", to: "dist" }],
  deps: {
    neverBundle: true,
  },
  dts: true,
  entry: "src/index.ts",
  minify: true,
})
