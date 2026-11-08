import path from "node:path"

import { defineLakeqlProject } from "@lakeql/vitest-config"

export default defineLakeqlProject({
  test: {
    // `mergeConfig` concatenates arrays, so this is appended to the base
    // `tests/**/*.test.ts` glob; docs tests live next to source under `src/`.
    include: ["src/**/*.test.ts"],
    name: "docs",
  },
  // `@` mirrors the docs tsconfig path alias so the mapping module can import
  // `@/lib/raw-markdown` under Vitest.
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
})
