import { createContext, useContext } from "react"

/**
 * The active rail section of the studio shell. This is pure view state: it
 * drives which secondary sidebar and main-content region render, and is kept
 * entirely separate from the editor's `EditorState` (switching a view never
 * mutates the definition).
 */
export type ShellView = "settings" | "fields" | "validations" | "json"

/**
 * The set of all valid {@link ShellView} ids, in rail order. Centralized here
 * so that anything needing to validate an external value (for example a URL
 * hash) against the view union has a single source of truth.
 */
export const SHELL_VIEWS: readonly ShellView[] = [
  "settings",
  "fields",
  "validations",
  "json",
]

/**
 * Narrows an arbitrary string to a {@link ShellView} when it is one of the
 * four valid view ids.
 *
 * @param value - The candidate string (for example the URL hash sans `#`).
 * @returns `true` when `value` is a valid {@link ShellView}.
 */
export function isShellView(value: string): value is ShellView {
  return (SHELL_VIEWS as readonly string[]).includes(value)
}

/**
 * The shell-view controller: the active rail section and a setter to switch it.
 * Held by the shell root (a `useState`) and read by the rail, the secondary
 * sidebar, the main content, and the Validations jump-to-field action.
 */
export interface ShellViewApi {
  /** The currently-active rail section. */
  view: ShellView
  /** Switches the active rail section. */
  setView: (view: ShellView) => void
}

const ShellViewContext = createContext<ShellViewApi | null>(null)

/**
 * Provides the {@link ShellViewApi} to the shell subtree.
 */
export const ShellViewProvider = ShellViewContext.Provider

/**
 * Reads the {@link ShellViewApi} from context without requiring a provider,
 * for components that also render outside the shell (for example a form
 * mounted on its own). Callers must handle `null` by omitting any
 * view-switching affordance.
 *
 * @returns The shell-view controller, or `null` outside a
 *   {@link ShellViewProvider}.
 */
export function useOptionalShellView(): ShellViewApi | null {
  return useContext(ShellViewContext)
}

/**
 * Reads the {@link ShellViewApi} from context.
 *
 * @returns The shell-view controller.
 * @throws {Error} When used outside a {@link ShellViewProvider}.
 */
export function useShellView(): ShellViewApi {
  const api = useContext(ShellViewContext)
  if (api === null) {
    throw new Error("useShellView must be used within a ShellViewProvider")
  }
  return api
}
