import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * Target B — standalone static build.
 *
 * `vite build` of `index.html` + `src/standalone` produces a self-contained
 * static app (HTML/JS/CSS) that renders the same `<EndpointBuilder />` as the
 * library target, so a future `lakeql studio` command can serve it without
 * rebuilding the UI (Req 1.2). React is bundled here (this is an app build),
 * unlike the library target where it stays external.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist/standalone",
    emptyOutDir: true,
  },
})
