import {
  BracesIcon,
  CircleAlertIcon,
  LayersIcon,
  PanelRightIcon,
  SettingsIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useIsNarrow } from "@/hooks/use-narrow"

import { LakeqlLogo } from "../components/lakeql-logo"
import { CanvasSurface } from "./canvas/canvas"
import { Palette } from "./canvas/palette"
import { CanvasShellRoot } from "./canvas/shell-root"
import { CommandPalette } from "./command-palette"
import { summarizeDiagnostics } from "./diagnostics"
import { FieldPropertiesPanel } from "./field-properties-panel"
import { FieldsEmptyState, KeyboardHint } from "./fields-extras"
import { ImportExportBar } from "./import-export-bar"
import { JsonViewPanel } from "./json-view-panel"
import { MetadataForm } from "./metadata-form"
import { MutationConfigForm } from "./mutation-config-form"
import type { ShellView } from "./shell-view"
import { ShellViewProvider, useShellView } from "./shell-view"
import { ThemeToggle } from "./theme-toggle"
import { UndoRedoControls, useUndoRedoShortcuts } from "./undo-redo-controls"
import { EditorProvider, useEditor, useEditorContext } from "./use-editor"
import { useHashView } from "./use-hash-view"
import { ValidationAnnouncer } from "./validation-announcer"
import { ValidationsView } from "./validations-view"

/** A rail section descriptor: its view id, label, and icon. */
interface RailSection {
  view: ShellView
  label: string
  icon: typeof SettingsIcon
}

const RAIL_SECTIONS: RailSection[] = [
  { view: "settings", label: "General Settings", icon: SettingsIcon },
  { view: "fields", label: "Fields", icon: LayersIcon },
  { view: "validations", label: "Validations", icon: CircleAlertIcon },
  { view: "json", label: "JSON", icon: BracesIcon },
]

/**
 * The icon rail (primary sidebar, collapsible to icons): one entry per view.
 * Each is a labelled, keyboard-operable `SidebarMenuButton` reflecting the
 * active view with `isActive`. The Validations entry carries a live badge with
 * the count of issues blocking export, matching the gate. Accessibility comes
 * from the shadcn sidebar primitives (roles, focus, keyboard toggle).
 */
const Rail = () => {
  const { view, setView } = useShellView()
  const { isMobile, setOpenMobile } = useSidebar()
  const editor = useEditorContext()
  const issueCount = summarizeDiagnostics(editor.validation).length

  // On mobile the rail is an off-canvas sheet; selecting a view should also
  // dismiss it so the chosen view's content (and its contextual secondary nav)
  // is visible. On desktop the rail stays put, so this is a no-op there.
  const selectView = (next: ShellView) => {
    setView(next)
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  // The rail's collapse behavior is viewport-aware (the `useIsMobile` 768px
  // breakpoint, surfaced here as the sidebar context's `isMobile`):
  //
  // - Mobile (≤767px): an off-canvas Sidebar so the shadcn Sheet path engages
  //   and the header's always-visible "Open navigation" trigger has a rail
  //   sheet to open. `collapsible="none"` would render a plain inline column at
  //   every viewport, leaving mobile with no reachable rail — the regression
  //   this restores.
  // - Desktop (≥768px): a slim, fixed icon-only column (`collapsible="none"`)
  //   with no expand/collapse chrome, no in-rail trigger, and no wordmark —
  //   just the logo and the view icons.
  return (
    <Sidebar
      collapsible={isMobile ? "offcanvas" : "none"}
      className={
        isMobile
          ? undefined
          : "w-[calc(var(--sidebar-width-icon)+1px)]! border-r"
      }
    >
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <LakeqlLogo className="size-6 shrink-0 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {RAIL_SECTIONS.map((section) => {
                const Icon = section.icon
                const showBadge =
                  section.view === "validations" && issueCount > 0
                return (
                  <SidebarMenuItem key={section.view}>
                    <SidebarMenuButton
                      tooltip={section.label}
                      isActive={view === section.view}
                      aria-current={view === section.view ? "page" : undefined}
                      onClick={() => selectView(section.view)}
                    >
                      <Icon />
                      <span>{section.label}</span>
                    </SidebarMenuButton>
                    {showBadge && (
                      <SidebarMenuBadge className="text-destructive">
                        {issueCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

/**
 * Describes the active view's contextual secondary panel: its accessible
 * label, the inline column's width class, and the panel content. Fields shows
 * the field-type palette, Validations the consolidated issue list; Settings and
 * JSON have no secondary panel (so `null`).
 */
interface SecondaryPanel {
  /** The accessible name for the panel region (and its mobile sheet title). */
  label: string
  /** The inline column's width utility class (desktop / tablet layout). */
  widthClass: string
  /** Whether the panel body needs the palette's `p-3` padding. */
  padded: boolean
  /** The panel's content. */
  content: ReactNode
}

/**
 * Resolves the {@link SecondaryPanel} for the active view, or `null` for views
 * (Settings, JSON) that have no contextual secondary navigation.
 */
const useSecondaryPanel = (): SecondaryPanel | null => {
  const { view } = useShellView()

  if (view === "fields") {
    return {
      label: "Field palette",
      widthClass: "w-64",
      padded: true,
      content: <Palette />,
    }
  }
  if (view === "validations") {
    return {
      label: "Validation issues",
      widthClass: "w-72",
      padded: false,
      content: <ValidationsView />,
    }
  }
  return null
}

/**
 * The contextual secondary sidebar, rendered as an inline column on viewports
 * wider than the phone breakpoint ({@link useIsNarrow}). At phone widths
 * (`≤560px`) it renders nothing inline — a fixed side column there would steal
 * horizontal space and clip the main content's field rows — and the panel is
 * reached on demand through the header's contextual-nav sheet
 * ({@link SecondaryNavSheet}) instead. Desktop and tablet (`>560px`) layout is
 * unchanged.
 */
const SecondarySidebar = () => {
  const panel = useSecondaryPanel()
  const isNarrow = useIsNarrow()

  if (panel === null || isNarrow) {
    return null
  }

  return (
    <aside
      aria-label={panel.label}
      className={`border-border shrink-0 overflow-y-auto border-r ${panel.widthClass} ${panel.padded ? "p-3" : ""}`}
    >
      {panel.content}
    </aside>
  )
}

/**
 * The phone-width (`≤560px`) presentation of the contextual secondary
 * navigation: a header trigger (shown alongside the primary-nav trigger)
 * opening a right-side {@link Sheet} that holds the active view's secondary
 * panel. It mounts only when the viewport is narrow and the active view
 * actually has a secondary panel, so Settings and JSON show no trigger. This
 * keeps the main content full-width on phones while the secondary nav stays
 * reachable. Desktop and tablet (`>560px`) are unaffected (the inline
 * {@link SecondarySidebar} column renders there instead).
 */
const SecondaryNavSheet = () => {
  const panel = useSecondaryPanel()
  const isNarrow = useIsNarrow()
  const [open, setOpen] = useState(false)

  if (panel === null || !isNarrow) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Open ${panel.label}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <PanelRightIcon />
      </Button>
      <SheetContent
        side="right"
        aria-label={panel.label}
        className="w-80 max-w-[90vw] gap-0 overflow-y-auto p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{panel.label}</SheetTitle>
          <SheetDescription>
            The contextual navigation for the current view.
          </SheetDescription>
        </SheetHeader>
        <div className={panel.padded ? "p-3" : ""}>{panel.content}</div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The General Settings view's main content: the metadata form and the mutation
 * config form, both reused unchanged (Req 2.1).
 */
const SettingsContent = () => (
  <div className="flex flex-1 flex-col gap-4 p-4">
    <div className="grid max-w-2xl gap-6">
      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Metadata</h2>
        <MetadataForm />
      </section>
      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Mutation</h2>
        <MutationConfigForm />
      </section>
    </div>
  </div>
)

/**
 * The Fields view's main content: the keyboard-discoverability hint, the
 * empty state (only while there are no fields), the drag-and-drop canvas, and
 * the field properties panel — co-located so the palette (secondary sidebar)
 * and the canvas are visible together under the one hoisted `DndContext`
 * (Req 3.1, 3.4, 7.1, 7.2).
 */
const FieldsContent = () => {
  const editor = useEditorContext()
  const empty = editor.state.fields.length === 0

  return (
    <div className="grid gap-4">
      {/* Content-fixed toolbar: the Undo/Redo buttons pinned to the top of the
          Fields content so they stay reachable while the field list scrolls.
          Scoped to the Fields view (Req 3.1, 3.3); the keyboard shortcut is
          global via `useUndoRedoShortcuts` at the shell root. */}
      <div className="bg-background sticky top-0 z-10 -mx-4 -mt-4 flex items-center border-b px-4 py-2">
        <UndoRedoControls />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-3">
          <KeyboardHint />
          {empty && <FieldsEmptyState />}
          <CanvasSurface />
        </div>
        <aside
          aria-label="Field properties"
          className="border-border/60 h-fit rounded-md border p-3"
        >
          <h2 className="mb-3 text-sm font-medium">Properties</h2>
          <FieldPropertiesPanel />
        </aside>
      </div>
    </div>
  )
}

/**
 * The main content region, switched by the active view. Validations has no
 * dedicated main content — it defers to the Fields view on navigate — so it
 * shows a brief hint pointing at the issue list in the secondary sidebar.
 */
const MainContent = () => {
  const { view } = useShellView()

  switch (view) {
    case "settings": {
      return <SettingsContent />
    }
    case "fields": {
      return <FieldsContent />
    }
    case "validations": {
      return (
        <p className="text-muted-foreground max-w-prose text-sm">
          Review the consolidated issue list in the panel on the left. Select an
          issue to jump to the offending field in the Fields view.
        </p>
      )
    }
    case "json": {
      return <JsonViewPanel />
    }
    default: {
      return null
    }
  }
}

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
