import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    neverBundle: true,
  },
  dts: true,
  entry: "src/*.ts",
  minify: true,
})
