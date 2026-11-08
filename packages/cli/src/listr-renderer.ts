/**
 * Chooses the Listr renderer based on whether stdout is an interactive
 * terminal. In a TTY the default renderer draws live progress; otherwise
 * (tests, CI, piped output) the silent renderer is used so task progress does
 * not flood non-interactive logs. The silent renderer is also selected when
 * `process.env.CI` is set, as belt-and-braces for CI runners that allocate a
 * pseudo-TTY.
 *
 * Spread into a `new Listr(..., { ...listrRendererOptions() })` call.
 */
export function listrRendererOptions():
  | { renderer: "silent" }
  | Record<string, never> {
  // oxlint-disable-next-line no-restricted-properties
  const isCi = Boolean(process.env.CI)
  return process.stdout.isTTY && !isCi ? {} : { renderer: "silent" }
}
