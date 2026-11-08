/**
 * The phase of the write pipeline where an error occurred.
 */
export type WritePipelinePhase = "serialize" | "upload" | "ddl" | "cleanup"

/**
 * Structured error thrown by the write pipeline to distinguish which phase
 * failed and whether the write was already committed (DDL succeeded).
 *
 * Error semantics:
 * - `serialize`, `upload`, `ddl` → `committed: false` (write can be safely retried)
 * - `cleanup` → `committed: true` (write succeeded, only old file cleanup failed)
 *
 * Callers identify a logically successful write by checking `committed === true`
 * on the caught error — in that case, only the cleanup needs attention, not a full retry.
 */
export class WritePipelineError extends Error {
  /** The phase where the failure occurred. */
  readonly phase: WritePipelinePhase
  /** Whether the write was already committed (DDL succeeded) before the error. */
  readonly committed: boolean

  constructor(phase: WritePipelinePhase, cause: unknown, message?: string) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause)
    const fullMessage =
      message ??
      `Write pipeline failed during "${phase}" phase: ${causeMessage}`

    super(fullMessage, { cause })
    this.name = "WritePipelineError"
    this.phase = phase
    this.committed = phase === "cleanup"
  }
}
