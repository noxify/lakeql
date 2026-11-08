import { QueryExecutionError, TimeoutError } from "@lakeql/datasource"
import { GraphQLError } from "graphql"
import { describe, expect, it, vi } from "vitest"

import { createErrorLoggingPlugin } from "../src/error-logging-plugin"

/** A logger stub capturing the level used and the final message. */
function fakeLogger() {
  const calls: { level: string; message: string }[] = []
  const chain = {
    withMetadata: () => chain,
    withError: () => chain,
    error: (message: string) => calls.push({ level: "error", message }),
    warn: (message: string) => calls.push({ level: "warn", message }),
  }
  // The plugin only uses withMetadata/withError/error/warn.
  return { logger: chain as never, calls }
}

/** Invoke the plugin's onExecuteDone with a result carrying the given errors. */
function runWithErrors(
  plugin: ReturnType<typeof createErrorLoggingPlugin>,
  errors: GraphQLError[]
): void {
  // onExecute returns the { onExecuteDone } hook object.
  const hooks = (plugin.onExecute as (args: unknown) => unknown)({}) as {
    onExecuteDone: (payload: { result: { errors: GraphQLError[] } }) => void
  }
  hooks.onExecuteDone({ result: { errors } })
}

describe(createErrorLoggingPlugin, () => {
  it("logs infrastructure failures (timeout) at error level", () => {
    const { logger, calls } = fakeLogger()
    const plugin = createErrorLoggingPlugin(logger)
    const err = new GraphQLError("Trino request timed out", {
      originalError: new TimeoutError("Trino request timed out", "trino", "ds"),
    })

    runWithErrors(plugin, [err])

    expect(calls).toStrictEqual([
      { level: "error", message: "Trino request timed out" },
    ])
  })

  it("logs expected client failures (query) at warn level", () => {
    const { logger, calls } = fakeLogger()
    const plugin = createErrorLoggingPlugin(logger)
    const err = new GraphQLError("Access denied", {
      originalError: new QueryExecutionError("Access denied", "trino", "ds"),
    })

    runWithErrors(plugin, [err])

    expect(calls).toStrictEqual([{ level: "warn", message: "Access denied" }])
  })

  it("logs a non-DataSourceError at error level (unexpected)", () => {
    const { logger, calls } = fakeLogger()
    const plugin = createErrorLoggingPlugin(logger)

    runWithErrors(plugin, [new GraphQLError("boom")])

    expect(calls).toStrictEqual([{ level: "error", message: "boom" }])
  })

  it("invokes the onError hook with the error and its data-source error", () => {
    const { logger } = fakeLogger()
    const onError = vi.fn<(context: unknown) => void>()
    const plugin = createErrorLoggingPlugin(logger, onError)
    const dsError = new TimeoutError("timed out", "trino", "ds")
    const err = new GraphQLError("timed out", { originalError: dsError })

    runWithErrors(plugin, [err])

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ error: err, dataSourceError: dsError })
    )
  })

  it("does nothing when there are no errors", () => {
    const { logger, calls } = fakeLogger()
    const plugin = createErrorLoggingPlugin(logger)

    runWithErrors(plugin, [])

    expect(calls).toStrictEqual([])
  })
})
