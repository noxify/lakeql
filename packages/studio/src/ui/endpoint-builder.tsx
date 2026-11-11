import {
  BracesIcon,
  CircleAlertIcon,
  LayersIcon,
  SettingsIcon,
} from "lucide-react"
import { useState } from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

import { CanvasSurface } from "./canvas/canvas"
import { Palette } from "./canvas/palette"
import { CanvasShellRoot } from "./canvas/shell-root"
import { summarizeDiagnostics } from "./diagnostics"
import { FieldPropertiesPanel } from "./field-properties-panel"
import { FieldsEmptyState, KeyboardHint } from "./fields-extras"
import { ImportExportBar } from "./import-export-bar"
import { JsonViewPanel } from "./json-view-panel"
import { MetadataForm } from "./metadata-form"
import { MutationConfigForm } from "./mutation-config-form"
import type { ShellView } from "./shell-view"
import { ShellViewProvider, useShellView } from "./shell-view"
import { UndoRedoControls } from "./undo-redo-controls"
import { EditorProvider, useEditor, useEditorContext } from "./use-editor"
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
  const editor = useEditorContext()
  const issueCount = summarizeDiagnostics(editor.validation).length

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarTrigger aria-label="Toggle navigation" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Views</SidebarGroupLabel>
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
                      onClick={() => setView(section.view)}
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
 * The contextual secondary sidebar, whose content depends on the active view:
 * the field-type palette in the Fields view, the consolidated issue list in the
 * Validations view, and nothing (collapsed) for Settings and JSON.
 */
const SecondarySidebar = () => {
  const { view } = useShellView()

  if (view === "fields") {
    return (
      <aside
        aria-label="Field palette"
        className="border-border w-64 shrink-0 overflow-y-auto border-r p-3"
      >
        <Palette />
      </aside>
    )
  }

  if (view === "validations") {
    return (
      <aside
        aria-label="Validation issues"
        className="border-border w-72 shrink-0 overflow-y-auto border-r"
      >
        <ValidationsView />
      </aside>
    )
  }

  return null
}

/**
 * The General Settings view's main content: the metadata form and the mutation
 * config form, both reused unchanged (Req 2.1).
 */
const SettingsContent = () => (
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
 * The sidebar-based shell: the icon rail, the contextual secondary sidebar, the
 * header bar (title + import/export + undo/redo + the live-region announcer),
 * and the switched main content — all inside one hoisted `DndContext` so a
 * palette→canvas drag spans the secondary sidebar and the main content.
 */
const EndpointBuilderShell = () => (
  <SidebarProvider>
    <ValidationAnnouncer />
    <Rail />
    <SidebarInset>
      <header className="border-border flex flex-col gap-2 border-b p-3">
        <div>
          <h1 className="text-base font-semibold">LakeQL Endpoint Builder</h1>
          <p className="text-muted-foreground text-sm">
            Visual authoring for LakeQL endpoint definitions.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ImportExportBar />
          <UndoRedoControls />
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
  const [view, setView] = useState<ShellView>("settings")

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
