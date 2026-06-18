#!/usr/bin/env node
import {
  error as formatError,
  info as formatInfo,
  warning as formatWarning,
} from "@lakeql/logger/console"

import { CliError, createAbortError, isPromptAbortError } from "@/errors"
import { runCli } from "@/run-cli"

interface ErrorLike {
  message?: string
  code?: string
  cause?: unknown
}

function asErrorLike(value: unknown): ErrorLike | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined
  }

  return value as ErrorLike
}

function getRootCauseMessage(error: unknown): string | undefined {
  let current = asErrorLike(error)
  let lastMessage = current?.message

  while (current?.cause) {
    const next = asErrorLike(current.cause)
    if (!next) {
      break
    }

    if (next.message) {
      lastMessage = next.message
    }

    current = next
  }

  return lastMessage
}

function getErrorCode(error: unknown): string | undefined {
  if (error instanceof CliError && error.code) {
    return error.code
  }

  const primary = asErrorLike(error)
  if (primary?.code) {
    return primary.code
  }

  const cause = asErrorLike(primary?.cause)
  return cause?.code
}

function getHintForError(error: unknown): string | undefined {
  if (error instanceof CliError && error.hint) {
    return error.hint
  }

  const rootMessage = getRootCauseMessage(error)?.toLowerCase() ?? ""
  const code = getErrorCode(error)

  if (
    rootMessage.includes("fetch failed") ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT"
  ) {
    return "Could not reach Trino. Verify HIVE_HOST/HIVE_PORT and that the Trino endpoint is reachable from your network."
  }

  if (
    rootMessage.includes("invalid environment variables") ||
    rootMessage.includes("required")
  ) {
    return "Missing or invalid environment variables. Set HIVE_HOST, HIVE_PORT, HIVE_USERNAME, HIVE_PASSWORD and HIVE_CATALOG."
  }

  return undefined
}

function formatCliError(error: unknown): string[] {
  const isAbort = error instanceof CliError && error.exitCode === 0
  const lines = [isAbort ? "LakeQL CLI aborted." : "LakeQL CLI failed."]
  const primary =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error"

  lines.push(`Reason: ${primary}`)

  if (error instanceof CliError && error.details?.length) {
    lines.push(...error.details)
  }

  const root = getRootCauseMessage(error)
  if (root && root !== primary) {
    lines.push(`Root cause: ${root}`)
  }

  const code = getErrorCode(error)
  if (code) {
    lines.push(`Error code: ${code}`)
  }

  const hint = getHintForError(error)
  if (hint) {
    lines.push(`Hint: ${hint}`)
  }

  return lines
}

// oxlint-disable-next-line promise/prefer-await-to-then promise/prefer-await-to-callbacks
runCli().catch((rawError: unknown) => {
  const error = isPromptAbortError(rawError) ? createAbortError() : rawError
  const lines = formatCliError(error)
  const isAbort = error instanceof CliError && error.exitCode === 0
  const formatHeadline = isAbort ? formatWarning : formatError

  const output = lines
    .map((line, index) =>
      index === 0 ? formatHeadline(line) : formatInfo(line)
    )
    .join("\n")

  // oxlint-disable-next-line no-console
  console.error(output)

  const exitCode = error instanceof CliError ? error.exitCode : 1
  process.exit(exitCode)
})
