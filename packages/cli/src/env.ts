/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-core"
import { number, string, enum as zodEnum } from "zod/v4"

type Env = ReturnType<typeof buildEnv>

let _env: Env | undefined

function buildEnv() {
  return createEnv({
    runtimeEnv: process.env,
    server: {
      HIVE_CATALOG: string().min(1),
      HIVE_HOST: string(),
      HIVE_PASSWORD: string().min(1),
      HIVE_PORT: string()
        .transform((s) => Math.trunc(Number(s)))
        .pipe(number()),
      HIVE_SOURCE: string().optional(),
      HIVE_USERNAME: string().min(1),
      LOG_LEVEL: zodEnum(["info", "warn", "error", "debug"]).default("warn"),
    },
  })
}

/**
 * Lazily validates and returns environment variables.
 * Only throws on first access — commands that don't call getEnv() won't trigger validation.
 */
export function getEnv(): Env {
  if (!_env) {
    _env = buildEnv()
  }
  return _env
}
