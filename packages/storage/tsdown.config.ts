import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    neverBundle: true,
  },
  dts: true,
  entry: ["src/*.ts", "src/serializer/parquet.ts"],
  minify: true,
})
