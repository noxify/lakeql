import { defineConfig } from "@lakeql/config"

import { permissions } from "./src/permissions"

/**
 * Mirrors the generated app's wiring: permissions authored in
 * `src/permissions.ts` (using `@lakeql/api/helpers`) are referenced here and
 * forwarded via `auth.permissions`.
 */
export default defineConfig({
  sourcePath: "src",
  adapters: [],
  dataSources: {},
  auth: { permissions },
})
