/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-core"
import { enum as zodEnum } from "zod/v4"

export const env = createEnv({
  runtimeEnv: process.env,
  server: {
    LOG_LEVEL: zodEnum(["info", "warn", "error", "debug"]).default("warn"),
    NODE_ENV: zodEnum(["development", "production", "test"]).default(
      "development"
    ),
  },
  shared: {
    LOG_LEVEL: zodEnum(["info", "warn", "error", "debug"]).default("warn"),
  },
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
})
