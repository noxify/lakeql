import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    neverBundle: true,
  },
  dts: true,
  entry: ["src/*.ts", "src/testing/index.ts"],
  minify: true,
})
