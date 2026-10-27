/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-core"
import { enum as zodEnum } from "zod/v4"

type Env = ReturnType<typeof buildEnv>

let _env: Env | undefined

function buildEnv() {
  return createEnv({
    runtimeEnv: process.env,
    server: {
      LOG_LEVEL: zodEnum(["info", "warn", "error", "debug"]).default("warn"),
    },
  })
}

/**
 * Lazily validates and returns CLI-level environment variables.
 * Only throws on first access — commands that don't call getEnv() won't trigger validation.
 *
 * Data source connection configuration is resolved from lakeql.config, not
 * from environment variables.
 */
export function getEnv(): Env {
  if (!_env) {
    _env = buildEnv()
  }
  return _env
}
