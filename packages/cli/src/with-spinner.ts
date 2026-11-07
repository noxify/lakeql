import { Listr } from "listr2"

import { listrRendererOptions } from "@/listr-renderer"

/**
 * Runs a single async operation while showing a one-line progress spinner on an
 * interactive terminal.
 *
 * The spinner is built on a single-task `listr2` list that reuses
 * {@link listrRendererOptions}, so the renderer policy is shared with the
 * `pull` / `bulk-pull` task lists. On a non-TTY / CI run the silent renderer is
 * selected, meaning `fn` still runs and its value is still returned, but no
 * animation is emitted. The spinner appears immediately (no delay timer)
 * because the wrapped operations are network round-trips the user is waiting
 * on.
 *
 * `exitOnError: true` ensures a rejection from `fn` is re-thrown, so any
 * surrounding error mapping (e.g. `createDataSourceConnectionError`) and
 * `finally { dataSource.close() }` cleanup still run.
 *
 * @template T - The resolved value type of the wrapped operation.
 * @param label - The spinner title shown while `fn` runs.
 * @param fn - The async operation to execute.
 * @returns The value resolved by `fn`, unchanged.
 * @throws {unknown} Re-throws any error `fn` rejects with.
 */
export async function withSpinner<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  let result!: T
  const tasks = new Listr(
    [
      {
        title: label,
        task: async () => {
          result = await fn()
        },
      },
    ],
    { exitOnError: true, ...listrRendererOptions() }
  )
  await tasks.run()
  return result
}
