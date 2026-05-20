/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-core"
import dotenv from "dotenv"
import { number, string, enum as zodEnum } from "zod/v4"

dotenv.config({
  path: "../../.env",
})

export const env = createEnv({
  runtimeEnv: process.env,
  /**
   * Serverside Environment variables, not available on the client.
   * Will throw if you access these variables on the client.
   */
  server: {
    HIVE_CATALOG: string().min(1),
    HIVE_HOST: string(),
    HIVE_PASSWORD: string().min(1),
    HIVE_PORT: string()
      .transform((s) => Number.parseInt(s, 10))
      .pipe(number()),
    HIVE_SOURCE: string().optional(),
    HIVE_USERNAME: string().min(1),
    LOG_LEVEL: zodEnum(["info", "warn", "error", "debug"]).default("warn"),
  },
})
