import { fileURLToPath } from "node:url"

import { defineLakeqlProject } from "@lakeql/vitest-config"
import react from "@vitejs/plugin-react"

/**
 * Studio's Vitest project. Core tests run in the shared Node environment; the
 * rendered-UI component tests (`tests/**\/*.test.tsx`) opt into a jsdom DOM per
 * file via a `// @vitest-environment jsdom` docblock, so the two kinds coexist
 * in one run without forcing a DOM on the pure core tests. The React plugin
 * provides the JSX transform those component tests need.
 */
export default defineLakeqlProject({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Appended to the shared console-suppress setup; a no-op under Node.
    setupFiles: [
      fileURLToPath(new URL("tests/setup/jsdom-polyfills.ts", import.meta.url)),
    ],
  },
})
