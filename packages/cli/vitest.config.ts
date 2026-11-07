import path from "node:path"

import { defineLakeqlProject } from "@lakeql/vitest-config"

export default defineLakeqlProject({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
})
