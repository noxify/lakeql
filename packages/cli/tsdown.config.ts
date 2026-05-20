import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    skipNodeModulesBundle: true,
  },
  dts: false,
  entry: "src/cli.ts",
  minify: true,
  tsconfig: "./tsconfig.json",
})
