import { defineConfig } from "tsdown"

export default defineConfig([
  {
    deps: {
      neverBundle: true,
    },
    dts: true,
    entry: ["src/index.ts", "src/cli.ts"],
    minify: true,
  },
  {
    deps: {
      neverBundle: true,
    },
    dts: true,
    entry: ["src/commands-metadata.ts"],
    minify: true,
  },
])
