/**
 * Chooses the Listr renderer based on whether stdout is an interactive
 * terminal. In a TTY the default renderer draws live progress; otherwise
 * (tests, CI, piped output) the silent renderer is used so task progress does
 * not flood non-interactive logs.
 *
 * Spread into a `new Listr(..., { ...listrRendererOptions() })` call.
 */
export function listrRendererOptions():
  | { renderer: "silent" }
  | Record<string, never> {
  return process.stdout.isTTY ? {} : { renderer: "silent" }
}
