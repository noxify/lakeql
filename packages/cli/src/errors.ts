export interface CliErrorOptions {
  code?: string
  hint?: string
  details?: string[]
  exitCode?: number
  cause?: unknown
}

export class CliError extends Error {
  code?: string
  hint?: string
  details?: string[]
  exitCode: number

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = "CliError"
    this.code = options.code
    this.hint = options.hint
    this.details = options.details
    this.exitCode = options.exitCode ?? 1
  }
}

export function createAbortError(message = "Aborted by user."): CliError {
  return new CliError(message, {
    code: "CLI_ABORTED",
    exitCode: 0,
  })
}

export function isPromptAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false
  }

  const maybeError = error as {
    name?: string
    code?: string
    message?: string
    cause?: { message?: string }
  }

  const combinedMessage =
    `${maybeError.message ?? ""} ${maybeError.cause?.message ?? ""}`.toLowerCase()

  return (
    maybeError.name === "CancelError" ||
    maybeError.code === "ABORT_ERR" ||
    combinedMessage.includes("cancelled") ||
    combinedMessage.includes("canceled") ||
    combinedMessage.includes("aborted") ||
    combinedMessage.includes("interrupted")
  )
}

export function createTrinoConnectionError(
  action: string,
  context: string,
  cause: unknown
): CliError {
  return new CliError(`Failed to ${action}.`, {
    code: "TRINO_REQUEST_FAILED",
    hint: "Verify HIVE_HOST/HIVE_PORT, credentials and network reachability to Trino.",
    details: [`Context: ${context}`],
    cause,
  })
}
