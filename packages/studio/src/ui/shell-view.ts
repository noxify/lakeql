import { createContext, useContext } from "react"

/**
 * The active rail section of the studio shell. This is pure view state: it
 * drives which secondary sidebar and main-content region render, and is kept
 * entirely separate from the editor's `EditorState` (switching a view never
 * mutates the definition).
 */
export type ShellView = "settings" | "fields" | "validations" | "json"

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
