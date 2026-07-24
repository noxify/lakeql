/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-core"
import { coerce, number, string, enum as zodEnum } from "zod/v4"

export const env = createEnv({
  runtimeEnv: process.env,
  server: {
    API_LOGGER: zodEnum(["debug", "info", "warn", "error", "silent"]).default(
      "warn"
    ),
    API_MAX_RECORDS_PER_PAGE: coerce.number().int().min(1).default(2000),
    API_PORT: coerce.number().default(4000),
    AUTH_MOCK: coerce.boolean().default(false),
    AUTH_MOCK_TOKEN: string().optional(),
    HIVE_CATALOG: string().min(1),
    HIVE_HOST: string(),
    HIVE_PASSWORD: string().min(1),
    HIVE_PORT: string()
      .transform((s) => Math.trunc(Number(s)))
      .pipe(number()),
    HIVE_SOURCE: string().optional(),
    HIVE_USERNAME: string().min(1),
    NODE_ENV: zodEnum(["development", "production", "test"]).default(
      "development"
    ),
  },
  skipValidation:
    !!process.env.CI ||
    process.env.npm_lifecycle_event === "lint" ||
    process.env.npm_lifecycle_event === "test",
})
