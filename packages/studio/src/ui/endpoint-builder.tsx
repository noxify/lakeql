import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

import { CanvasShellRoot } from "./canvas/shell-root"
import { CommandPalette } from "./command-palette"
import { ImportExportBar } from "./import-export-bar"
import { MainContent } from "./main-content"
import { Rail } from "./rail"
import { SecondaryNavSheet, SecondarySidebar } from "./secondary-sidebar"
import { ShellViewProvider } from "./shell-view"
import { ThemeToggle } from "./theme-toggle"
import { useUndoRedoShortcuts } from "./undo-redo-controls"
import { EditorProvider, useEditor } from "./use-editor"
import { useHashView } from "./use-hash-view"
import { ValidationAnnouncer } from "./validation-announcer"

/**
 * The sidebar-based shell: the icon rail (with the LakeQL logo in its header),
 * the contextual secondary sidebar, the header bar (title + import/export + the
 * compact issue count + the live-region announcer), and the switched main
 * content — all inside one hoisted `DndContext` so a palette→canvas drag spans
 * the secondary sidebar and the main content. The Undo/Redo buttons live in the
 * Fields view's content-fixed toolbar, while the keyboard undo/redo shortcut is
 * mounted globally here via {@link useUndoRedoShortcuts}. The {@link
 * CommandPalette} in the header mounts the global ⌘K listener (disjoint from
 * undo/redo) alongside its visible affordance.
 */
const EndpointBuilderShell = () => {
  // Global, view-independent keyboard undo/redo. Mounted once here (not in the
  // Fields-only Undo/Redo toolbar) so the shortcut works on every view.
  useUndoRedoShortcuts()

  return (
    <SidebarProvider>
      <ValidationAnnouncer />
      <Rail />
      <SidebarInset>
        <header className="border-border flex flex-col gap-2 border-b p-3">
          {/* <div>
            <h1 className="text-base font-semibold">LakeQL Endpoint Builder</h1>
            <p className="text-muted-foreground text-sm">
              Visual authoring for LakeQL endpoint definitions.
            </p>
          </div> */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {/* The always-visible mobile navigation trigger. It lives in the
                  header (never inside an off-canvas sidebar), so it is the one
                  affordance that can open the rail sheet on mobile, where the
                  rail — and the rail's own trigger — are off-canvas. Hidden on
                  desktop (`md:hidden`), where the icon rail is always visible,
                  so desktop behavior is unchanged. */}
              <SidebarTrigger
                className="md:hidden"
                aria-label="Open navigation"
              />
              {/* The phone-width contextual-nav trigger, mounted beside the
                  primary-nav trigger. It only renders at ≤560px for views that
                  have a secondary panel, opening that panel in a sheet so the
                  main content keeps full width on phones. */}
              <SecondaryNavSheet />
              <ImportExportBar />
            </div>
            <div className="flex items-center gap-2">
              <CommandPalette />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <SecondarySidebar />
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            <MainContent />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * Root component of the LakeQL Endpoint Builder.
 *
 * Composes the shadcn `sidebar-09`-style shell — an icon rail (General Settings
 * / Fields / Validations / JSON), a contextual secondary sidebar, a header bar,
 * and the switched main content — over the framework-agnostic `@/core`. The
 * live `EditorState` drives rendering and validation; structural actions route
 * through the core field operations; the draft autosaves via the core
 * persistence layer.
 *
 * The provider chain is layered precisely: `EditorProvider` (all canvas hooks
 * read it) wraps the hoisted {@link CanvasShellRoot} (the single `@dnd-kit`
 * `DndContext` plus the keyboard-move / type-change providers), which wraps the
 * shell's view state and the `SidebarProvider`. Hoisting the `DndContext` above
 * the sidebar is what lets the Fields palette (secondary sidebar) and the
 * canvas (main content) live in different subtrees while still resolving one
 * another's drag payloads.
 */
export const EndpointBuilder = () => {
  const editor = useEditor()
  // The active view is synced with the URL hash (`#settings` / `#fields` /
  // `#validations` / `#json`) so a reload or a shared deep link restores it.
  const [view, setView] = useHashView()

  return (
    <EditorProvider value={editor}>
      <CanvasShellRoot>
        <ShellViewProvider value={{ view, setView }}>
          <TooltipProvider>
            <div className="bg-background text-foreground flex min-h-svh w-full">
              <EndpointBuilderShell />
            </div>
          </TooltipProvider>
        </ShellViewProvider>
      </CanvasShellRoot>
    </EditorProvider>
  )
}
