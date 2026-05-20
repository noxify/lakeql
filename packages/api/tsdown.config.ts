import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    skipNodeModulesBundle: true,
  },
  entry: ["src/**/*.ts"],
  minify: true,
  tsconfig: "./tsconfig.json",
})
