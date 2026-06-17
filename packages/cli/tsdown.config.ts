import { defineConfig } from "tsdown"

export default defineConfig([
  {
    deps: {
      skipNodeModulesBundle: true,
    },
    dts: true,
    entry: ["src/index.ts", "src/cli.ts"],
    minify: true,
  },
  {
    deps: {
      skipNodeModulesBundle: true,
    },
    dts: true,
    entry: ["src/commands-metadata.ts"],
    minify: true,
  },
])
