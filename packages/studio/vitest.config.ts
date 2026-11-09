import { fileURLToPath } from "node:url"

import { defineLakeqlProject } from "@lakeql/vitest-config"

export default defineLakeqlProject({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("src", import.meta.url)),
    },
  },
})
