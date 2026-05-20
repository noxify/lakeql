import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      all: true,
      exclude: ["**/*.d.ts", "*.config.(mjs|js|ts)", "vitest.config/"],
      include: ["packages/*/src/**/*.{ts,tsx}"],
      provider: "v8",
    },
    projects: ["packages/*"],
  },
})
