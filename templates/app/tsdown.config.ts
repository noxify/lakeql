import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    skipNodeModulesBundle: true,
  },
  dts: false,
  entry: ["src/**/*.ts", "!src/**/interface.ts"],
  minify: true,
  tsconfig: "./tsconfig.json",
})
