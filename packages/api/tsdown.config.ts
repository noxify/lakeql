import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    neverBundle: true,
  },
  entry: ["src/**/*.ts"],
  minify: true,
  tsconfig: "./tsconfig.json",
})
