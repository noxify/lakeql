import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    skipNodeModulesBundle: true,
  },
  dts: { entry: "src/index.ts" },
  entry: ["src/cli.ts", "src/index.ts"],
  minify: true,
  tsconfig: "./tsconfig.json",
})
