import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * `apps/editor` is a thin Vite React SPA shell that mounts the
 * `<EndpointBuilder />` component from `@lakeql/studio` and consumes the
 * package's precompiled CSS. The build output is purely static (no server
 * functions, no SSR), deployed to `editor.lakeql.dev` on Vercel's free plan
 * (Req 1.3, 1.5).
 */
export default defineConfig({
  plugins: [react()],
})
