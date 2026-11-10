import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

/**
 * Target A — CSS asset build.
 *
 * Compiles the package's Tailwind v4 / shadcn stylesheet into a single
 * precompiled `dist/studio.css`, so a consumer (`apps/editor`, or a future
 * `lakeql studio`) needs no Tailwind configuration of its own to render the
 * builder correctly (Req 1.1, Req 11.4).
 *
 * This is deliberately separate from the `tsdown` library build, which owns
 * the JS + `.d.ts` emit but cannot compile a Tailwind stylesheet. A tiny JS
 * entry (`src/styles/css-entry.ts`) imports the stylesheet so Vite emits it as
 * a single asset; the entry's JS output is discarded (it carries no runtime).
 */
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: fileURLToPath(new URL("src/styles/css-entry.ts", import.meta.url)),
      output: {
        // Discarded: the entry has no runtime, it only pulls in the CSS.
        entryFileNames: "studio-css-entry.mjs",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? ""
          return name.endsWith(".css") ? "studio.css" : "[name][extname]"
        },
      },
    },
  },
})
