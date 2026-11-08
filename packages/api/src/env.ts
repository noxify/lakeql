/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-core"
import { coerce, string, enum as zodEnum } from "zod/v4"

export const env = createEnv({
  runtimeEnv: process.env,
  server: {
    API_LOGGER: zodEnum(["debug", "info", "warn", "error", "silent"]).default(
      "warn"
    ),
    API_PORT: coerce.number().default(4000),
    AUTH_MOCK: coerce.boolean().default(false),
    AUTH_MOCK_TOKEN: string().optional(),
    NODE_ENV: zodEnum(["development", "production", "test"]).default(
      "development"
    ),
  },
  skipValidation:
    !!process.env.CI ||
    process.env.npm_lifecycle_event === "lint" ||
    process.env.npm_lifecycle_event === "test",
})
