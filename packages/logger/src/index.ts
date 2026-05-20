import { inspect } from "node:util"

import { redactionPlugin } from "@loglayer/plugin-redaction"
import { WinstonTransport } from "@loglayer/transport-winston"
import fastRedact from "fast-redact"
import { LogLayer } from "loglayer"
import { serializeError } from "serialize-error"
import { format, transports, createLogger as winstonLogger } from "winston"

import { env } from "./env"

const {
  combine,
  errors,
  timestamp: timestampFn,
  colorize,
  splat,
  printf,
} = format

const redactPaths = [
  "*.password",
  "*.username",
  "*.secret",
  "*.token",
  "*.key",
  "*.credentials",
  "*.headers.*",
]
const redactMessages = fastRedact({
  paths: redactPaths,
  serialize: false,
})

const devFormat = combine(
  format((info) => {
    info.level = info.level.toUpperCase()
    return info
  })(),
  colorize(),
  timestampFn(),
  splat(),
  errors({ stack: true }),
  printf(({ timestamp, level, message, ...rest }) => {
    const stripped = Object.fromEntries(Object.entries(rest))

    const { context, metadata, err } = {
      context: {},
      err: {},
      metadata: {},
      ...stripped,
    }

    let finalError = err
    const coloredContext = inspect(redactMessages(context), {
      colors: true,
      compact: true,
      depth: 10,
      showHidden: false,
    })
    const coloredMetadata = inspect(metadata, {
      colors: true,
      compact: true,
      depth: 10,
      showHidden: false,
    })

    if (
      "code" in err &&
      [
        "ETIMEDOUT",
        "ECONNRESET",
        "EADDRINUSE",
        "ECONNREFUSED",
        "EPIPE",
        "ENOTFOUND",
        "ENETUNREACH",
        "EAI_AGAIN",
      ].includes(err.code as string)
    ) {
      finalError = {
        success: false,
        // @ts-expect-error - this is a valid field, but the type is unknown
        errors: err.message as string,
        statusCode: err.code,
        // @ts-expect-error - this is a valid field, but the type is unknown
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        source: err.options.url,
      }
    }
    const coloredError = inspect(redactMessages(finalError), {
      colors: true,
      compact: false,
      depth: 10,
      showHidden: false,
    })

    const hasContext = coloredContext !== "{}"
    const hasMetadata = coloredMetadata !== "{}"
    const hasError = coloredError !== "{}"

    const contextOutput = hasContext ? `\nContext: ${coloredContext}` : ""
    const metadataOutput = hasMetadata ? `\nMetadata: ${coloredMetadata}` : ""
    const errorOutput = hasError ? `\nError: ${coloredError}` : ""

    return `[${timestamp as string}] ${level} - ${message as string}${contextOutput}${metadataOutput}${errorOutput}`
  })
)
const w = winstonLogger({
  format: devFormat,
  level: env.LOG_LEVEL,
  transports: [new transports.Console()],
})

export const createLogger = () => {
  const presets = [new WinstonTransport({ id: "winston", logger: w })]

  return new LogLayer({
    contextFieldName: "context",
    errorFieldInMetadata: false,
    errorSerializer: serializeError,
    metadataFieldName: "metadata",
    plugins: [
      redactionPlugin({
        paths: redactPaths,
      }),
    ],
    transport: presets,
  })
}
